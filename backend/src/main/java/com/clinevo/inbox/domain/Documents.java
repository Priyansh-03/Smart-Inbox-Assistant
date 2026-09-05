package com.clinevo.inbox.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Row models. Plain POJOs mapped by InboxRepository; kept public for brevity. */
public final class Documents {

    private Documents() {}

    public static class Message {
        public String id;
        public String messageIdHdr;
        public String sender;
        public String subject;
        public Instant receivedAt;
        public String bodyText;
        public String status;
        public int attempts;
        public Long processingMs;
        public Instant processingStartedAt;
        public Instant processingEndedAt;
        public String errorDetail;
        public boolean injectionFlagged;
        public String injectionNotes;
        public Instant createdAt;
    }

    public static class Attachment {
        public String id;
        public String messageId;
        public String filename;
        public String mimeType;
        public String storagePath;
        public boolean processed;
        public String skipReason;
    }

    public static class PdfExtraction {
        public String id;
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
        public boolean injectionFlagged;
        public String injectionNotes;
    }

    public static class Classification {
        public String id;
        public String messageId;
        public String bucket;
        public boolean applies;
        public Double confidence;
        public String reason;
        public String reviewStatus;
        public String model;
        public String promptVersion;
        public Instant createdAt;
    }

    public static class Fact {
        public String id;
        public String messageId;
        public String bucket;
        public String section;
        public String fieldName;
        public String fieldValue;
        public Double confidence;
        public Source source;
        public String caseLabel;
        public String reviewedValue;
        public String reviewStatus;

        public static class Source {
            public String type;
            public String file;
            public Integer page;
            public String quote;
        }
    }

    public static class AuditEvent {
        public String id;
        public String messageId;
        public String actor;
        public String action;
        public String target;
        public String oldValue;
        public String newValue;
        public String detailJson;
        public Instant createdAt;
    }

    public static class AiCall {
        public String id;
        public String messageId;
        public String step;
        public String model;
        public String promptVersion;
        public String inputHash;
        public Object output;
        public Object usage;
        public Long durationMs;
        public String error;
        public Instant createdAt;
    }
}
