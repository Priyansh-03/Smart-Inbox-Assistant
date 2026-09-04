package com.clinevo.inbox.ingestion;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;

import org.jsoup.Jsoup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.clinevo.inbox.audit.AuditService;
import com.clinevo.inbox.config.AppProperties;
import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.InboxRepository;

/** Turns a raw MimeMessage into persisted message + attachment rows. Shared by IMAP poll and .eml upload. */
@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);

    private final InboxRepository repo;
    private final AuditService audit;
    private final Path storageRoot;
    private final long maxAttachmentBytes;
    private final int maxBodyChars;

    public IngestionService(InboxRepository repo, AuditService audit, AppProperties props) {
        this.repo = repo;
        this.audit = audit;
        this.storageRoot = Path.of(props.storageDir());
        this.maxAttachmentBytes = (long) props.ingest().maxAttachmentMb() * 1024 * 1024;
        this.maxBodyChars = props.ingest().maxBodyChars();
    }

    /** .eml import path - no IMAP UID. */
    public String ingest(MimeMessage mime) {
        return ingest(mime, null);
    }

    /** Persist one email. Returns the new message id, or null if it was a duplicate. */
    public String ingest(MimeMessage mime, Long imapUid) {
        try {
            String sender = mime.getFrom() != null && mime.getFrom().length > 0 ? mime.getFrom()[0].toString() : "unknown";
            String subject = mime.getSubject() == null ? "(no subject)" : mime.getSubject();
            Instant received = mime.getReceivedDate() != null ? mime.getReceivedDate().toInstant()
                    : (mime.getSentDate() != null ? mime.getSentDate().toInstant() : Instant.now());

            StringBuilder body = new StringBuilder();
            List<Part> attachments = new ArrayList<>();
            walk(mime, body, attachments, false);
            String bodyText = clampBody(body.toString().trim());

            // Stable dedupe key: real Message-ID, else a content hash so re-delivery is still a no-op.
            String hdr = firstHeader(mime, "Message-ID", null);
            if (hdr == null) hdr = "sha256:" + sha256(sender + "|" + subject + "|" + received + "|" + bodyText);
            if (repo.messageExists(hdr)) {
                log.info("Ingest skipped: message {} already stored", hdr);
                return null;
            }

            String messageId = repo.insertMessage(hdr, imapUid == null ? null : String.valueOf(imapUid),
                    sender, subject, received, bodyText);
            log.info("Ingested message {} (id={}) from {} with {} attachment(s)", hdr, messageId, sender, attachments.size());

            int stored = 0;
            for (Part p : attachments) {
                if (storeAttachment(messageId, p)) stored++;
            }
            audit.ai(messageId, "ingested", "message",
                    "{\"attachments\":" + attachments.size() + ",\"pdfsStored\":" + stored + "}");
            return messageId;
        } catch (MessagingException | IOException e) {
            log.error("Ingest failed: {}", e.getMessage(), e);
            throw new IllegalStateException("ingest failed", e);
        }
    }

    /** @return true if a PDF was stored for processing. Never throws - a bad attachment is logged, not fatal. */
    private boolean storeAttachment(String messageId, Part p) {
        String filename = "attachment";
        try {
            filename = safeName(p.getFileName());
            String mime = p.getContentType() == null ? "" : p.getContentType().split(";")[0].trim();
            boolean isPdf = filename.toLowerCase().endsWith(".pdf") || Constants.MIME_PDF.equalsIgnoreCase(mime);

            byte[] bytes = readCapped(p, maxAttachmentBytes + 1);
            if (bytes.length > maxAttachmentBytes) {
                repo.insertAttachment(messageId, filename, mime, (long) bytes.length, null, false,
                        "over size cap (" + maxAttachmentBytes + " bytes)");
                log.warn("Attachment {} on message {} skipped: {} bytes over cap", filename, messageId, bytes.length);
                return false;
            }
            if (!isPdf) {
                repo.insertAttachment(messageId, filename, mime, (long) bytes.length, null, false,
                        "non-pdf attachment logged only");
                log.info("Attachment {} on message {} logged, not processed (type {})", filename, messageId, mime);
                return false;
            }
            Path dir = storageRoot.resolve(messageId);
            Files.createDirectories(dir);
            Path target = dir.resolve(filename);
            Files.write(target, bytes);
            repo.insertAttachment(messageId, filename, Constants.MIME_PDF, (long) bytes.length, target.toString(), true, null);
            log.info("Attachment {} on message {} stored ({} bytes) at {}", filename, messageId, bytes.length, target);
            return true;
        } catch (Exception e) {
            log.error("Attachment {} on message {} failed to store: {}", filename, messageId, e.getMessage(), e);
            try {
                repo.insertAttachment(messageId, filename, "", null, null, false, "store failed: " + e.getMessage());
            } catch (Exception ignore) {
                log.error("Could not record failed attachment for message {}", messageId);
            }
            return false;
        }
    }

    /** Read a part's bytes up to {@code limit}; caller compares length to the real cap. */
    private static byte[] readCapped(Part p, long limit) throws MessagingException, IOException {
        try (InputStream in = p.getInputStream()) {
            return in.readNBytes((int) Math.min(limit, Integer.MAX_VALUE));
        }
    }

    /**
     * Collect body text (prefer text/plain; convert text/html to text) and attachments.
     * multipart/alternative: take the richest text once, skip the rest.
     */
    private void walk(Part part, StringBuilder body, List<Part> attachments, boolean insideAlternative)
            throws MessagingException, IOException {
        String disposition = part.getDisposition();
        String filename = part.getFileName();
        if (Part.ATTACHMENT.equalsIgnoreCase(disposition) || (filename != null && !filename.isBlank())) {
            attachments.add(part);
            return;
        }

        String type = baseType(part);
        Object content;
        try {
            content = part.getContent();
        } catch (IOException e) {
            log.warn("Unreadable part ({}), skipped: {}", type, e.getMessage());
            return;
        }

        if (content instanceof String s) {
            body.append(Constants.MIME_TEXT_HTML.equalsIgnoreCase(type) ? Jsoup.parse(s).text() : s).append('\n');
            return;
        }
        if (content instanceof Multipart mp) {
            boolean alternative = type.endsWith("/alternative");
            for (int i = 0; i < mp.getCount(); i++) {
                Part child = mp.getBodyPart(i);
                if (alternative && body.length() > 0 && isText(child)) continue;
                walk(child, body, attachments, alternative || insideAlternative);
            }
        }
    }

    private String clampBody(String s) {
        if (s.length() <= maxBodyChars) return s;
        log.warn("Body truncated from {} to {} chars", s.length(), maxBodyChars);
        return s.substring(0, maxBodyChars) + "\n[truncated]";
    }

    private static boolean isText(Part p) throws MessagingException {
        return baseType(p).startsWith("text/");
    }

    private static String baseType(Part p) throws MessagingException {
        String ct = p.getContentType();
        return ct == null ? "" : ct.split(";")[0].trim().toLowerCase();
    }

    private static String firstHeader(Message m, String name, String fallback) throws MessagingException {
        String[] v = m.getHeader(name);
        return v != null && v.length > 0 ? v[0] : fallback;
    }

    /** Basename only, safe characters only - blocks path traversal via crafted filenames. */
    static String safeName(String raw) {
        if (raw == null || raw.isBlank()) return "attachment-" + System.nanoTime();
        String base = raw.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).trim();
        base = base.replaceAll("[^\\w.\\-]", "_");
        return base.isBlank() || base.equals(".") || base.equals("..") ? "attachment-" + System.nanoTime() : base;
    }

    private static String sha256(String s) {
        try {
            byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
