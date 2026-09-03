package com.clinevo.inbox.review;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.Documents.Classification;
import com.clinevo.inbox.domain.Documents.Message;
import com.clinevo.inbox.domain.InboxRepository;

/** Batch timing report: per-document processing time and outcome (assignment section 3E). */
@RestController
@RequestMapping("/api/batch")
public class BatchController {

    private static final Logger log = LoggerFactory.getLogger(BatchController.class);

    private final InboxRepository repo;

    public BatchController(InboxRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/report")
    public Map<String, Object> report() {
        List<Message> all = repo.queue(null);
        List<Map<String, Object>> rows = all.stream().map(m -> {
            List<Classification> cls = repo.classifications(m.id);
            String buckets = cls.stream().filter(c -> c.applies).map(c -> c.bucket).sorted().reduce((a, b) -> a + "," + b).orElse("");
            return Map.<String, Object>of(
                    "id", m.id, "subject", m.subject == null ? "" : m.subject,
                    "status", m.status, "processingMs", m.processingMs == null ? 0 : m.processingMs,
                    "buckets", buckets, "attempts", m.attempts);
        }).toList();
        long done = all.stream().filter(m -> Constants.STATUS_READY.equals(m.status) || Constants.STATUS_REVIEWED.equals(m.status)).count();
        double avg = rows.stream().mapToLong(r -> ((Number) r.get("processingMs")).longValue()).filter(v -> v > 0).average().orElse(0);
        log.info("Batch report: {} messages, {} processed, avg {}ms", all.size(), done, Math.round(avg));
        return Map.of("total", all.size(), "processed", done, "avgProcessingMs", Math.round(avg), "rows", rows);
    }
}
