package com.clinevo.inbox.domain;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import com.fasterxml.jackson.core.type.TypeReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.Documents.Attachment;
import com.clinevo.inbox.domain.Documents.AuditEvent;
import com.clinevo.inbox.domain.Documents.Classification;
import com.clinevo.inbox.domain.Documents.Fact;
import com.clinevo.inbox.domain.Documents.Message;
import com.clinevo.inbox.domain.Documents.PdfExtraction;

/** Single persistence seam (PostgreSQL via JdbcClient). Swap this class to move DB. */
@Repository
public class InboxRepository {

    private static final Logger log = LoggerFactory.getLogger(InboxRepository.class);

    private final JdbcClient jdbc;

    public InboxRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /* ---------- ingestion ---------- */

    public boolean messageExists(String messageIdHdr) {
        return jdbc.sql("SELECT count(*) FROM message WHERE message_id_hdr = :h")
                .param("h", messageIdHdr).query(Long.class).single() > 0;
    }

    public String insertMessage(String hdr, String sender, String subject, Instant receivedAt, String body) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.sql("""
                INSERT INTO message (message_id_hdr, sender, subject, received_at, body_text, status)
                VALUES (:h, :s, :subj, :r, :b, 'NEW')
                """)
                .param("h", hdr).param("s", sender).param("subj", subject)
                .param("r", receivedAt == null ? null : Timestamp.from(receivedAt))
                .param("b", body)
                .update(kh, "id");
        String id = String.valueOf(kh.getKey().longValue());
        log.info("Saved message id={} hdr={}", id, hdr);
        return id;
    }

    public String insertAttachment(String messageId, String filename, String mime, String path,
                                   boolean processed, String skipReason) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.sql("""
                INSERT INTO attachment (message_id, filename, mime_type, storage_path, processed, skip_reason)
                VALUES (:m, :f, :mt, :p, :pr, :sr)
                """)
                .param("m", Long.valueOf(messageId)).param("f", filename).param("mt", mime)
                .param("p", path).param("pr", processed).param("sr", skipReason)
                .update(kh, "id");
        String id = String.valueOf(kh.getKey().longValue());
        log.info("Saved attachment id={} file={} processed={}", id, filename, processed);
        return id;
    }

    /* ---------- queue ---------- */

    public Optional<Message> claimNextNew() {
        Optional<Message> claimed = jdbc.sql("""
                UPDATE message SET status = 'PROCESSING', attempts = attempts + 1
                WHERE id = (
                    SELECT id FROM message WHERE status = 'NEW'
                    ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
                )
                RETURNING *
                """).query(MESSAGE).optional();
        claimed.ifPresent(m -> log.info("Worker claimed message id={} attempt={}", m.id, m.attempts));
        return claimed;
    }

    public List<Attachment> processableAttachments(String messageId) {
        return jdbc.sql("SELECT * FROM attachment WHERE message_id = :m AND processed = true")
                .param("m", Long.valueOf(messageId)).query(ATTACHMENT).list();
    }

    public void markMessage(String id, String status, Long ms, String error) {
        jdbc.sql("UPDATE message SET status = :st, processing_ms = :ms, error_detail = :err WHERE id = :id")
                .param("st", status).param("ms", ms).param("err", error).param("id", Long.valueOf(id))
                .update();
        log.info("Message id={} -> {}{}", id, status, error == null ? "" : " (" + error + ")");
    }

    public int attempts(String id) {
        return jdbc.sql("SELECT attempts FROM message WHERE id = :id")
                .param("id", Long.valueOf(id)).query(Integer.class).optional().orElse(Integer.MAX_VALUE);
    }

    /* ---------- AI results ---------- */

    public void clearAiResults(String messageId) {
        Long m = Long.valueOf(messageId);
        jdbc.sql("DELETE FROM fact WHERE message_id = :m").param("m", m).update();
        jdbc.sql("DELETE FROM classification WHERE message_id = :m").param("m", m).update();
        jdbc.sql("DELETE FROM pdf_extraction WHERE message_id = :m").param("m", m).update();
        log.info("Cleared prior AI results for message id={}", messageId);
    }

    public void save(PdfExtraction e) {
        jdbc.sql("""
                INSERT INTO pdf_extraction (message_id, attachment_id, filename, flavor, language, page_count,
                    full_text, original_text, ocr_confidence, tables, images, summary, looks_relevant, relevance_reason)
                VALUES (:m, :a, :f, :fl, :lang, :pc, :ft, :ot, :oc,
                        CAST(:tables AS jsonb), CAST(:images AS jsonb), :sm, :lr, :rr)
                """)
                .param("m", Long.valueOf(e.messageId))
                .param("a", e.attachmentId == null ? null : Long.valueOf(e.attachmentId))
                .param("f", e.filename).param("fl", e.flavor).param("lang", e.language).param("pc", e.pageCount)
                .param("ft", e.fullText).param("ot", e.originalText).param("oc", e.ocrConfidence)
                .param("tables", Jsonb.write(e.tables)).param("images", Jsonb.write(e.images))
                .param("sm", e.summary).param("lr", e.looksRelevant).param("rr", e.relevanceReason)
                .update();
    }

    public void save(Classification c) {
        jdbc.sql("""
                INSERT INTO classification (message_id, bucket, applies, confidence, reason, review_status, model, prompt_version)
                VALUES (:m, :b, :ap, :c, :r, :rs, :md, :pv)
                """)
                .param("m", Long.valueOf(c.messageId)).param("b", c.bucket).param("ap", c.applies)
                .param("c", c.confidence).param("r", c.reason)
                .param("rs", c.reviewStatus == null ? Constants.REVIEW_AI : c.reviewStatus)
                .param("md", c.model).param("pv", c.promptVersion)
                .update();
    }

    public void save(Fact f) {
        jdbc.sql("""
                INSERT INTO fact (message_id, bucket, section, field_name, field_value, confidence, source, reviewed_value, review_status)
                VALUES (:m, :b, :se, :fn, :fv, :c, CAST(:src AS jsonb), :rv, :rs)
                """)
                .param("m", Long.valueOf(f.messageId)).param("b", f.bucket).param("se", f.section)
                .param("fn", f.fieldName).param("fv", f.fieldValue).param("c", f.confidence)
                .param("src", Jsonb.write(f.source)).param("rv", f.reviewedValue)
                .param("rs", f.reviewStatus == null ? Constants.REVIEW_AI : f.reviewStatus)
                .update();
    }

    /* ---------- review reads ---------- */

    public List<Message> queue(String status) {
        if (status == null || status.isBlank()) {
            return jdbc.sql("SELECT * FROM message ORDER BY id DESC").query(MESSAGE).list();
        }
        return jdbc.sql("SELECT * FROM message WHERE status = :st ORDER BY id DESC")
                .param("st", status).query(MESSAGE).list();
    }

    public Message message(String id) {
        return jdbc.sql("SELECT * FROM message WHERE id = :id")
                .param("id", Long.valueOf(id)).query(MESSAGE).optional().orElse(null);
    }

    public List<Classification> classifications(String messageId) {
        return jdbc.sql("SELECT * FROM classification WHERE message_id = :m ORDER BY bucket")
                .param("m", Long.valueOf(messageId)).query(CLASSIFICATION).list();
    }

    public List<Fact> facts(String messageId) {
        return jdbc.sql("SELECT * FROM fact WHERE message_id = :m ORDER BY section, field_name")
                .param("m", Long.valueOf(messageId)).query(FACT).list();
    }

    public List<PdfExtraction> pdfExtractions(String messageId) {
        return jdbc.sql("SELECT * FROM pdf_extraction WHERE message_id = :m ORDER BY id")
                .param("m", Long.valueOf(messageId)).query(PDF_EXTRACTION).list();
    }

    public List<AuditEvent> audit(String messageId) {
        return jdbc.sql("SELECT * FROM audit_event WHERE message_id = :m ORDER BY id")
                .param("m", Long.valueOf(messageId)).query(AUDIT_EVENT).list();
    }

    /* ---------- review writes ---------- */

    public void updateClassification(String messageId, String bucket, boolean applies, String reviewStatus) {
        jdbc.sql("UPDATE classification SET applies = :ap, review_status = :rs WHERE message_id = :m AND bucket = :b")
                .param("ap", applies).param("rs", reviewStatus)
                .param("m", Long.valueOf(messageId)).param("b", bucket).update();
        log.info("Classification message={} bucket={} applies={} ({})", messageId, bucket, applies, reviewStatus);
    }

    public Fact fact(String factId) {
        return jdbc.sql("SELECT * FROM fact WHERE id = :id")
                .param("id", Long.valueOf(factId)).query(FACT).optional().orElse(null);
    }

    public void updateFact(String factId, String reviewedValue, String reviewStatus) {
        jdbc.sql("UPDATE fact SET reviewed_value = :v, review_status = :rs WHERE id = :id")
                .param("v", reviewedValue).param("rs", reviewStatus).param("id", Long.valueOf(factId)).update();
        log.info("Fact id={} reviewed ({})", factId, reviewStatus);
    }

    /* ---------- row mappers ---------- */

    private static String str(ResultSet rs, String col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : String.valueOf(v);
    }

    private static Instant inst(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Double dbl(ResultSet rs, String col) throws SQLException {
        double v = rs.getDouble(col);
        return rs.wasNull() ? null : v;
    }

    private static final RowMapper<Message> MESSAGE = (rs, i) -> {
        Message m = new Message();
        m.id = str(rs, "id");
        m.messageIdHdr = rs.getString("message_id_hdr");
        m.sender = rs.getString("sender");
        m.subject = rs.getString("subject");
        m.receivedAt = inst(rs, "received_at");
        m.bodyText = rs.getString("body_text");
        m.status = rs.getString("status");
        m.attempts = rs.getInt("attempts");
        long ms = rs.getLong("processing_ms");
        m.processingMs = rs.wasNull() ? null : ms;
        m.errorDetail = rs.getString("error_detail");
        m.createdAt = inst(rs, "created_at");
        return m;
    };

    private static final RowMapper<Attachment> ATTACHMENT = (rs, i) -> {
        Attachment a = new Attachment();
        a.id = str(rs, "id");
        a.messageId = str(rs, "message_id");
        a.filename = rs.getString("filename");
        a.mimeType = rs.getString("mime_type");
        a.storagePath = rs.getString("storage_path");
        a.processed = rs.getBoolean("processed");
        a.skipReason = rs.getString("skip_reason");
        return a;
    };

    private static final RowMapper<PdfExtraction> PDF_EXTRACTION = (rs, i) -> {
        PdfExtraction e = new PdfExtraction();
        e.id = str(rs, "id");
        e.messageId = str(rs, "message_id");
        e.attachmentId = str(rs, "attachment_id");
        e.filename = rs.getString("filename");
        e.flavor = rs.getString("flavor");
        e.language = rs.getString("language");
        int pc = rs.getInt("page_count");
        e.pageCount = rs.wasNull() ? null : pc;
        e.fullText = rs.getString("full_text");
        e.originalText = rs.getString("original_text");
        e.ocrConfidence = dbl(rs, "ocr_confidence");
        e.tables = Jsonb.read(rs.getString("tables"), new TypeReference<>() {});
        e.images = Jsonb.read(rs.getString("images"), new TypeReference<>() {});
        e.summary = rs.getString("summary");
        Boolean lr = rs.getObject("looks_relevant", Boolean.class);
        e.looksRelevant = lr;
        e.relevanceReason = rs.getString("relevance_reason");
        return e;
    };

    private static final RowMapper<Classification> CLASSIFICATION = (rs, i) -> {
        Classification c = new Classification();
        c.id = str(rs, "id");
        c.messageId = str(rs, "message_id");
        c.bucket = rs.getString("bucket");
        c.applies = rs.getBoolean("applies");
        c.confidence = dbl(rs, "confidence");
        c.reason = rs.getString("reason");
        c.reviewStatus = rs.getString("review_status");
        c.model = rs.getString("model");
        c.promptVersion = rs.getString("prompt_version");
        c.createdAt = inst(rs, "created_at");
        return c;
    };

    private static final RowMapper<Fact> FACT = (rs, i) -> {
        Fact f = new Fact();
        f.id = str(rs, "id");
        f.messageId = str(rs, "message_id");
        f.bucket = rs.getString("bucket");
        f.section = rs.getString("section");
        f.fieldName = rs.getString("field_name");
        f.fieldValue = rs.getString("field_value");
        f.confidence = dbl(rs, "confidence");
        f.source = Jsonb.read(rs.getString("source"), new TypeReference<>() {});
        f.reviewedValue = rs.getString("reviewed_value");
        f.reviewStatus = rs.getString("review_status");
        return f;
    };

    private static final RowMapper<AuditEvent> AUDIT_EVENT = (rs, i) -> {
        AuditEvent a = new AuditEvent();
        a.id = str(rs, "id");
        a.messageId = str(rs, "message_id");
        a.actor = rs.getString("actor");
        a.action = rs.getString("action");
        a.target = rs.getString("target");
        a.oldValue = rs.getString("old_value");
        a.newValue = rs.getString("new_value");
        a.detailJson = rs.getString("detail_json");
        a.createdAt = inst(rs, "created_at");
        return a;
    };
}
