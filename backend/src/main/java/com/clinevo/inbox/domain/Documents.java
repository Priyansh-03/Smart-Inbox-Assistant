package com.clinevo.inbox.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** Mongo persistence models. Fields are mapped directly; kept public for brevity. */
public final class Documents {

    private Documents() {}

    @Document("message")
    public static class Message {
        @Id public String id;
        public String messageIdHdr;
        public String sender;
        public String subject;
        public Instant receivedAt;
        public String bodyText;
        public String status;
        public int attempts;
        public Long processingMs;
        public String errorDetail;
        public Instant createdAt = Instant.now();
    }

    @Document("attachment")
    public static class Attachment {
        @Id public String id;
        public String messageId;
        public String filename;
        public String mimeType;
        public String storagePath;
        public boolean processed;
        public String skipReason;
    }

    @Document("pdf_extraction")
    public static class PdfExtraction {
        @Id public String id;
        public String messageId;
        public String attachmentId;
        public String filename;
        public String flavor;
        public String language;
        public Integer pageCount;
        public String fullText;
        public String originalText;
        public Double ocrConfidence;
        public List<Object> tables;
        public List<Map<String, Object>> images;
        public String summary;
        public Boolean looksRelevant;
        public String relevanceReason;
    }

    @Document("classification")
    public static class Classification {
        @Id public String id;
        public String messageId;
        public String bucket;
        public boolean applies;
        public Double confidence;
        public String reason;
        public String reviewStatus;
        public String model;
        public String promptVersion;
        public Instant createdAt = Instant.now();
    }

    @Document("fact")
    public static class Fact {
        @Id public String id;
        public String messageId;
        public String bucket;
        public String section;
        public String fieldName;
        public String fieldValue;
        public Double confidence;
        public Source source;
        public String reviewedValue;
        public String reviewStatus;

        public static class Source {
            public String type;
            public String file;
            public Integer page;
            public String quote;
        }
    }

    @Document("audit_event")
    public static class AuditEvent {
        @Id public String id;
        public String messageId;
        public String actor;
        public String action;
        public String target;
        public String oldValue;
        public String newValue;
        public String detailJson;
        public Instant createdAt = Instant.now();
    }
}
