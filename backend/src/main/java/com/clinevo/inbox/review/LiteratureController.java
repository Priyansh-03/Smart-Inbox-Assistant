package com.clinevo.inbox.review;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.clinevo.inbox.ai.AiClient;
import com.clinevo.inbox.ai.AiDtos;
import com.clinevo.inbox.audit.AuditService;
import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.Documents.Classification;
import com.clinevo.inbox.domain.Documents.Fact;
import com.clinevo.inbox.domain.Documents.PdfExtraction;
import com.clinevo.inbox.domain.InboxRepository;

/**
 * Bonus (spec §14): article PDFs uploaded independently of the mailbox. Each article is
 * screened for identifiable patient cases, split into cases, and ICSR facts extracted per
 * case. Results are stored as a normal message so the existing review screen shows them.
 */
@RestController
@RequestMapping("/api/literature")
public class LiteratureController {

    private static final Logger log = LoggerFactory.getLogger(LiteratureController.class);

    private final InboxRepository repo;
    private final AiClient ai;
    private final AuditService audit;

    public LiteratureController(InboxRepository repo, AiClient ai, AuditService audit) {
        this.repo = repo;
        this.ai = ai;
        this.audit = audit;
    }

    /** One screened article: its stored message id plus the full AI screening result for inline display. */
    public record UploadResult(String messageId, AiDtos.LiteratureResult screening) {}

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<UploadResult> upload(@RequestParam("files") MultipartFile[] files) throws Exception {
        log.info("Literature upload called: {} file(s)", files == null ? 0 : files.length);
        List<UploadResult> results = new ArrayList<>();
        try {
            for (MultipartFile f : files) {
                String name = f.getOriginalFilename() == null ? "article.pdf" : f.getOriginalFilename();
                String b64 = Base64.getEncoder().encodeToString(f.getBytes());

                String messageId = repo.insertMessage("lit:" + name + ":" + System.nanoTime(), null,
                        "literature-upload", "Literature screening: " + name, Instant.now(), "");
                // Keep the mailbox worker off it: it is not a mailbox message.
                repo.markMessage(messageId, Constants.STATUS_PROCESSING, null, null);
                repo.insertAttachment(messageId, name, Constants.MIME_PDF, (long) f.getSize(), null, false,
                        "literature upload (not stored on disk)");

                AiDtos.LiteratureResult r = ai.screenLiterature(new AiDtos.LiteratureIn(name, b64));
                persist(messageId, r);
                repo.markMessage(messageId, Constants.STATUS_READY, null, null);
                log.info("Literature {} -> message id={} ({} case(s))", name, messageId,
                        r.cases() == null ? 0 : r.cases().size());
                results.add(new UploadResult(messageId, r));
            }
        } catch (Exception e) {
            log.error("Literature upload failed after {} of {} file(s): {}", results.size(),
                    files == null ? 0 : files.length, e.toString());
            throw e;
        }
        return results;
    }

    private void persist(String messageId, AiDtos.LiteratureResult r) {
        PdfExtraction e = new PdfExtraction();
        e.messageId = messageId;
        e.filename = r.filename();
        e.flavor = r.flavor();
        e.language = r.language();
        e.summary = r.summary();
        e.looksRelevant = r.looksRelevant();
        e.relevanceReason = r.relevanceReason();
        repo.save(e);

        Classification c = new Classification();
        c.messageId = messageId;
        c.bucket = r.hasPatientCase() ? "ICSR" : Constants.BUCKET_NOT_RELEVANT;
        c.applies = true;
        c.confidence = r.hasPatientCase() ? 0.8 : 0.6;
        c.reason = r.relevanceReason();
        c.reviewStatus = Constants.REVIEW_AI;
        repo.save(c);

        int caseNo = 0;
        for (AiDtos.LiteratureCase lc : r.cases() == null ? List.<AiDtos.LiteratureCase>of() : r.cases()) {
            caseNo++;
            String label = lc.caseLabel() == null ? "Case " + caseNo : lc.caseLabel();
            for (AiDtos.Fact fx : lc.facts() == null ? List.<AiDtos.Fact>of() : lc.facts()) {
                Fact fact = new Fact();
                fact.messageId = messageId;
                fact.bucket = "ICSR";
                fact.section = fx.section();
                fact.fieldName = fx.fieldName();
                fact.fieldValue = fx.value();
                fact.confidence = fx.confidence();
                fact.caseLabel = label;
                fact.reviewStatus = Constants.REVIEW_AI;
                if (fx.source() != null) {
                    Fact.Source s = new Fact.Source();
                    s.type = fx.source().type();
                    s.file = fx.source().file();
                    s.page = fx.source().page();
                    s.quote = fx.source().quote();
                    fact.source = s;
                }
                repo.save(fact);
            }
        }
        audit.ai(messageId, "literature_screened", r.filename(),
                "{\"cases\":" + caseNo + ",\"hasPatientCase\":" + r.hasPatientCase() + "}");
    }
}
