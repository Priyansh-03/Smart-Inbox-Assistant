package com.clinevo.inbox.domain;

import static org.springframework.data.mongodb.core.query.Criteria.where;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.Documents.Attachment;
import com.clinevo.inbox.domain.Documents.Classification;
import com.clinevo.inbox.domain.Documents.Fact;
import com.clinevo.inbox.domain.Documents.Message;
import com.clinevo.inbox.domain.Documents.PdfExtraction;

/** Single persistence seam. Swap this class to move off MongoDB. */
@Repository
public class InboxRepository {

    private static final Logger log = LoggerFactory.getLogger(InboxRepository.class);

    private final MongoTemplate mongo;

    public InboxRepository(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    /* ---------- ingestion ---------- */

    public boolean messageExists(String messageIdHdr) {
        return mongo.exists(new Query(where("messageIdHdr").is(messageIdHdr)), Message.class);
    }

    public String insertMessage(String hdr, String sender, String subject, Instant receivedAt, String body) {
        Message m = new Message();
        m.messageIdHdr = hdr;
        m.sender = sender;
        m.subject = subject;
        m.receivedAt = receivedAt;
        m.bodyText = body;
        m.status = Constants.STATUS_NEW;
        mongo.insert(m);
        log.info("Saved message id={} hdr={}", m.id, hdr);
        return m.id;
    }

    public String insertAttachment(String messageId, String filename, String mime, String path,
                                   boolean processed, String skipReason) {
        Attachment a = new Attachment();
        a.messageId = messageId;
        a.filename = filename;
        a.mimeType = mime;
        a.storagePath = path;
        a.processed = processed;
        a.skipReason = skipReason;
        mongo.insert(a);
        log.info("Saved attachment id={} file={} processed={}", a.id, filename, processed);
        return a.id;
    }

    /* ---------- queue ---------- */

    public Optional<Message> claimNextNew() {
        Message claimed = mongo.findAndModify(
                new Query(where("status").is(Constants.STATUS_NEW)).with(org.springframework.data.domain.Sort.by("_id")),
                new Update().set("status", Constants.STATUS_PROCESSING).inc("attempts", 1),
                new FindAndModifyOptions().returnNew(true),
                Message.class);
        if (claimed != null) log.info("Worker claimed message id={} attempt={}", claimed.id, claimed.attempts);
        return Optional.ofNullable(claimed);
    }

    public List<Attachment> processableAttachments(String messageId) {
        return mongo.find(new Query(where("messageId").is(messageId).and("processed").is(true)), Attachment.class);
    }

    public void markMessage(String id, String status, Long ms, String error) {
        mongo.updateFirst(new Query(where("_id").is(id)),
                new Update().set("status", status).set("processingMs", ms).set("errorDetail", error),
                Message.class);
        log.info("Message id={} -> {}{}", id, status, error == null ? "" : " (" + error + ")");
    }

    public int attempts(String id) {
        Message m = mongo.findById(id, Message.class);
        return m == null ? Integer.MAX_VALUE : m.attempts;
    }

    /* ---------- AI results ---------- */

    public void clearAiResults(String messageId) {
        mongo.remove(new Query(where("messageId").is(messageId)), Fact.class);
        mongo.remove(new Query(where("messageId").is(messageId)), Classification.class);
        mongo.remove(new Query(where("messageId").is(messageId)), PdfExtraction.class);
        log.info("Cleared prior AI results for message id={}", messageId);
    }

    public void save(PdfExtraction e) { mongo.insert(e); }

    public void save(Classification c) { mongo.insert(c); }

    public void save(Fact f) { mongo.insert(f); }

    /* ---------- review reads ---------- */

    public List<Message> queue(String status) {
        Query q = new Query().with(org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "_id"));
        if (status != null && !status.isBlank()) q.addCriteria(where("status").is(status));
        return mongo.find(q, Message.class);
    }

    public Message message(String id) {
        return mongo.findById(id, Message.class);
    }

    public List<Classification> classifications(String messageId) {
        return mongo.find(new Query(where("messageId").is(messageId)).with(org.springframework.data.domain.Sort.by("bucket")), Classification.class);
    }

    public List<Fact> facts(String messageId) {
        return mongo.find(new Query(where("messageId").is(messageId)).with(org.springframework.data.domain.Sort.by("section", "fieldName")), Fact.class);
    }

    public List<PdfExtraction> pdfExtractions(String messageId) {
        return mongo.find(new Query(where("messageId").is(messageId)), PdfExtraction.class);
    }

    public List<Documents.AuditEvent> audit(String messageId) {
        return mongo.find(new Query(where("messageId").is(messageId)).with(org.springframework.data.domain.Sort.by("_id")), Documents.AuditEvent.class);
    }

    /* ---------- review writes ---------- */

    public void updateClassification(String messageId, String bucket, boolean applies, String reviewStatus) {
        mongo.updateFirst(new Query(where("messageId").is(messageId).and("bucket").is(bucket)),
                new Update().set("applies", applies).set("reviewStatus", reviewStatus), Classification.class);
        log.info("Classification message={} bucket={} applies={} ({})", messageId, bucket, applies, reviewStatus);
    }

    public Fact fact(String factId) {
        return mongo.findById(factId, Fact.class);
    }

    public void updateFact(String factId, String reviewedValue, String reviewStatus) {
        mongo.updateFirst(new Query(where("_id").is(factId)),
                new Update().set("reviewedValue", reviewedValue).set("reviewStatus", reviewStatus), Fact.class);
        log.info("Fact id={} reviewed ({})", factId, reviewStatus);
    }
}
