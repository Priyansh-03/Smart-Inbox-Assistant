package com.clinevo.inbox.review;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.clinevo.inbox.audit.AuditService;
import com.clinevo.inbox.config.AppProperties;
import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.Documents.Fact;
import com.clinevo.inbox.domain.InboxRepository;

/** Reviewer-facing API. Every write is audited with the reviewer id and a timestamp. */
@RestController
@RequestMapping("/api/messages")
public class ReviewController {

    private static final Logger log = LoggerFactory.getLogger(ReviewController.class);

    private final InboxRepository repo;
    private final AuditService audit;
    private final String reviewerId;

    public ReviewController(InboxRepository repo, AuditService audit, AppProperties props) {
        this.repo = repo;
        this.audit = audit;
        this.reviewerId = props.reviewerId();
    }

    @GetMapping
    public List<Map<String, Object>> queue(@RequestParam(required = false) String status) {
        log.info("Queue requested (status={})", status);
        return repo.queue(status).stream().map(m -> {
            var cls = repo.classifications(m.id).stream().filter(c -> c.applies).toList();
            String buckets = cls.stream().map(c -> c.bucket).sorted().reduce((a, b) -> a + "," + b).orElse("");
            Double minConf = cls.stream().map(c -> c.confidence).filter(java.util.Objects::nonNull)
                    .min(Double::compareTo).orElse(null);
            Map<String, Object> row = new java.util.HashMap<>();
            row.put("id", m.id);
            row.put("sender", m.sender);
            row.put("subject", m.subject);
            row.put("receivedAt", m.receivedAt);
            row.put("status", m.status);
            row.put("processingMs", m.processingMs);
            row.put("buckets", buckets);
            row.put("minConf", minConf);
            row.put("injectionFlagged", m.injectionFlagged);
            row.put("injectionNotes", m.injectionNotes);
            return row;
        }).toList();
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        log.info("Detail requested for message id={}", id);
        return Map.of(
                "message", repo.message(id),
                "pdfExtractions", repo.pdfExtractions(id),
                "classifications", repo.classifications(id),
                "facts", repo.facts(id),
                "aiCalls", repo.aiCalls(id),
                "audit", repo.audit(id));
    }

    @PatchMapping("/{id}/classification")
    public ResponseEntity<Void> setClassification(@PathVariable String id, @RequestBody ClassificationEdit body) {
        repo.updateClassification(id, body.bucket(), body.applies(),
                body.applies() ? Constants.REVIEW_ACCEPTED : Constants.REVIEW_OVERRIDDEN);
        String detail = body.reason() == null || body.reason().isBlank() ? null
                : "{\"reason\":" + com.fasterxml.jackson.databind.node.TextNode.valueOf(body.reason()) + "}";
        audit.event(id, reviewerId, "classification_" + (body.applies() ? "accepted" : "overridden"),
                body.bucket(), null, String.valueOf(body.applies()), detail);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/facts")
    public ResponseEntity<Void> editFacts(@PathVariable String id, @RequestBody List<FactEdit> edits) {
        for (FactEdit e : edits) {
            Fact before = repo.fact(e.factId());
            String old = before == null ? null : (before.reviewedValue != null ? before.reviewedValue : before.fieldValue);
            boolean accepted = e.value() == null || e.value().equals(old);
            repo.updateFact(e.factId(), e.value(),
                    accepted ? Constants.REVIEW_ACCEPTED : Constants.REVIEW_OVERRIDDEN);
            audit.event(id, reviewerId, accepted ? "fact_accepted" : "fact_overridden",
                    e.factId(), old, e.value(), null);
        }
        log.info("Message id={} had {} fact edit(s) by {}", id, edits.size(), reviewerId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/complete")
    public ResponseEntity<Void> complete(@PathVariable String id) {
        repo.markMessage(id, Constants.STATUS_REVIEWED, null, null);
        audit.event(id, reviewerId, "review_completed", "message", null, null, null);
        log.info("Message id={} marked REVIEWED by {}", id, reviewerId);
        return ResponseEntity.noContent().build();
    }

    /** Redrive a FAILED message back into the queue. */
    @PostMapping("/{id}/retry")
    public ResponseEntity<Void> retry(@PathVariable String id) {
        boolean requeued = repo.resetFailedToNew(id);
        if (!requeued) return ResponseEntity.status(409).build();
        audit.event(id, reviewerId, "retry_requested", "message", Constants.STATUS_FAILED, Constants.STATUS_NEW, null);
        return ResponseEntity.noContent().build();
    }

    public record ClassificationEdit(String bucket, boolean applies, String reason) {}

    public record FactEdit(String factId, String value) {}
}
