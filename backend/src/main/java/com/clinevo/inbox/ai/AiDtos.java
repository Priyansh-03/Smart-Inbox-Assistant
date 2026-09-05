package com.clinevo.inbox.ai;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

public final class AiDtos {

    private AiDtos() {}

    public record PdfIn(String filename, String base64) {}

    public record LiteratureIn(String filename, String base64) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LiteratureCase(
            @JsonProperty("case_label") String caseLabel,
            String text, boolean reportable, List<Fact> facts) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LiteratureResult(
            String filename, String flavor, String language, String summary,
            @JsonProperty("looks_relevant") Boolean looksRelevant,
            @JsonProperty("relevance_reason") String relevanceReason,
            @JsonProperty("has_patient_case") boolean hasPatientCase,
            List<LiteratureCase> cases,
            @JsonProperty("ai_calls") List<AiCall> aiCalls) {}

    public record ProcessRequest(
            @JsonProperty("message_id") String messageId,
            @JsonProperty("email_from") String emailFrom,
            @JsonProperty("email_subject") String emailSubject,
            @JsonProperty("email_body") String emailBody,
            List<PdfIn> pdfs) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Source(String type, String file, Integer page, String quote) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Fact(String section,
                       @JsonProperty("field_name") String fieldName,
                       String value, Double confidence, Source source) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BucketVerdict(String bucket, boolean applies, double confidence, String reason) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PdfResult(
            String filename, String flavor, String language,
            @JsonProperty("page_count") int pageCount,
            @JsonProperty("full_text") String fullText,
            @JsonProperty("original_text") String originalText,
            @JsonProperty("ocr_confidence") Double ocrConfidence,
            List<Object> tables, List<Map<String, Object>> images,
            String summary,
            @JsonProperty("looks_relevant") Boolean looksRelevant,
            @JsonProperty("relevance_reason") String relevanceReason,
            @JsonProperty("injection_flagged") boolean injectionFlagged,
            @JsonProperty("injection_notes") String injectionNotes) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AiCall(
            String step, String model,
            @JsonProperty("prompt_version") String promptVersion,
            @JsonProperty("input_hash") String inputHash,
            Object output, Map<String, Object> usage,
            @JsonProperty("duration_ms") Integer durationMs,
            String error, Double ts) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ProcessResponse(
            @JsonProperty("message_id") String messageId,
            String model,
            @JsonProperty("prompt_version") String promptVersion,
            @JsonProperty("latency_ms") Map<String, Integer> latencyMs,
            List<PdfResult> pdfs,
            List<BucketVerdict> classifications,
            List<Fact> facts,
            @JsonProperty("ai_calls") List<AiCall> aiCalls,
            @JsonProperty("injection_flagged") boolean injectionFlagged,
            @JsonProperty("injection_notes") String injectionNotes) {}
}
