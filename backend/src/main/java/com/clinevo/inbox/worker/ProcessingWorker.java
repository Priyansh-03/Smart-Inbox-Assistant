package com.clinevo.inbox.worker;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.clinevo.inbox.ai.AiClient;
import com.clinevo.inbox.ai.AiDtos;
import com.clinevo.inbox.audit.AuditService;
import com.clinevo.inbox.config.AppProperties;
import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.Documents.Attachment;
import com.clinevo.inbox.domain.Documents.Classification;
import com.clinevo.inbox.domain.Documents.Fact;
import com.clinevo.inbox.domain.Documents.Message;
import com.clinevo.inbox.domain.Documents.PdfExtraction;
import com.clinevo.inbox.domain.InboxRepository;

/** DB-status queue consumer: claims one NEW message, runs the AI pipeline, persists, audits. */
@Component
public class ProcessingWorker {

    private static final Logger log = LoggerFactory.getLogger(ProcessingWorker.class);

    private final InboxRepository repo;
    private final AiClient ai;
    private final AuditService audit;
    private final int maxAttempts;

    public ProcessingWorker(InboxRepository repo, AiClient ai, AuditService audit, AppProperties props) {
        this.repo = repo;
        this.ai = ai;
        this.audit = audit;
        this.maxAttempts = props.worker().maxAttempts();
    }

    @Scheduled(fixedDelayString = "${app.worker.poll-ms}")
    public void tick() {
        repo.claimNextNew().ifPresent(this::process);
    }

    private void process(Message m) {
        long started = System.currentTimeMillis();
        try {
            repo.clearAiResults(m.id);
            List<Attachment> pdfs = repo.processableAttachments(m.id);
            AiDtos.ProcessRequest req = new AiDtos.ProcessRequest(
                    m.id, m.sender, m.subject, m.bodyText, readPdfs(pdfs));
            log.info("Processing message id={} with {} pdf(s)", m.id, pdfs.size());

            AiDtos.ProcessResponse res = ai.process(req);
            persist(m, pdfs, res);
            repo.markInjection(m.id, res.injectionFlagged(), res.injectionNotes());
            if (res.injectionFlagged()) {
                audit.ai(m.id, "injection_flagged", "message",
                        "{\"notes\":\"" + truncate(res.injectionNotes()) + "\"}");
            }

            long ms = System.currentTimeMillis() - started;
            repo.markMessage(m.id, Constants.STATUS_READY, ms, null);
            audit.ai(m.id, "processed", "message",
                    "{\"latencyMs\":" + res.latencyMs() + ",\"model\":\"" + res.model() + "\"}");
            log.info("Message id={} ready for review in {}ms", m.id, ms);
        } catch (Exception e) {
            long ms = System.currentTimeMillis() - started;
            int attempts = repo.attempts(m.id);
            if (attempts >= maxAttempts) {
                repo.markMessage(m.id, Constants.STATUS_FAILED, ms, truncate(e.getMessage()));
                audit.ai(m.id, "failed", "message", "{\"error\":\"" + truncate(e.getMessage()) + "\"}");
                log.error("Message id={} failed permanently after {} attempts: {}", m.id, attempts, e.getMessage(), e);
            } else {
                repo.markMessage(m.id, Constants.STATUS_NEW, ms, truncate(e.getMessage()));
                log.warn("Message id={} failed attempt {}, requeued: {}", m.id, attempts, e.getMessage());
            }
        }
    }

    private void persist(Message m, List<Attachment> pdfs, AiDtos.ProcessResponse res) {
        for (AiDtos.PdfResult p : safe(res.pdfs())) {
            Attachment att = pdfs.stream().filter(a -> a.filename.equals(p.filename())).findFirst().orElse(null);
            PdfExtraction e = new PdfExtraction();
            e.messageId = m.id;
            e.attachmentId = att == null ? null : att.id;
            e.filename = p.filename();
            e.flavor = p.flavor();
            e.language = p.language();
            e.pageCount = p.pageCount();
            e.fullText = p.fullText();
            e.originalText = p.originalText();
            e.ocrConfidence = p.ocrConfidence();
            e.tables = p.tables();
            e.images = p.images();
            e.summary = p.summary();
            e.looksRelevant = p.looksRelevant();
            e.relevanceReason = p.relevanceReason();
            e.injectionFlagged = p.injectionFlagged();
            e.injectionNotes = p.injectionNotes();
            repo.save(e);
            audit.ai(m.id, "pdf_extracted", p.filename(),
                    "{\"flavor\":\"" + p.flavor() + "\",\"language\":\"" + p.language() + "\"}");
        }

        for (AiDtos.BucketVerdict v : safe(res.classifications())) {
            Classification c = new Classification();
            c.messageId = m.id;
            c.bucket = v.bucket();
            c.applies = v.applies();
            c.confidence = v.confidence();
            c.reason = v.reason();
            c.reviewStatus = Constants.REVIEW_AI;
            c.model = res.model();
            c.promptVersion = res.promptVersion();
            repo.save(c);
        }
        audit.ai(m.id, "classified", "message", "{\"buckets\":" + safe(res.classifications()).size() + "}");

        for (AiDtos.Fact f : safe(res.facts())) {
            Fact fact = new Fact();
            fact.messageId = m.id;
            fact.bucket = bucketFor(f.section());
            fact.section = f.section();
            fact.fieldName = f.fieldName();
            fact.fieldValue = f.value();
            fact.confidence = f.confidence();
            fact.reviewStatus = Constants.REVIEW_AI;
            if (f.source() != null) {
                Fact.Source s = new Fact.Source();
                s.type = f.source().type();
                s.file = f.source().file();
                s.page = f.source().page();
                s.quote = f.source().quote();
                fact.source = s;
            }
            repo.save(fact);
        }
        audit.ai(m.id, "facts_extracted", "message", "{\"count\":" + safe(res.facts()).size() + "}");
    }

    private List<AiDtos.PdfIn> readPdfs(List<Attachment> pdfs) {
        List<AiDtos.PdfIn> out = new ArrayList<>();
        for (Attachment a : pdfs) {
            try {
                byte[] bytes = Files.readAllBytes(Path.of(a.storagePath));
                out.add(new AiDtos.PdfIn(a.filename, Base64.getEncoder().encodeToString(bytes)));
            } catch (Exception e) {
                log.error("Cannot read attachment {} at {}: {}", a.filename, a.storagePath, e.getMessage());
                throw new IllegalStateException("unreadable attachment: " + a.filename, e);
            }
        }
        return out;
    }

    private static <T> List<T> safe(List<T> l) { return l == null ? List.of() : l; }

    private static String truncate(String s) {
        if (s == null) return "unknown";
        return s.length() > 1000 ? s.substring(0, 1000) : s;
    }

    static String bucketFor(String section) {
        return switch (section == null ? "" : section) {
            case "COMPLAINT" -> "PQC";
            case "QUESTION" -> "MI";
            default -> "ICSR";
        };
    }
}
