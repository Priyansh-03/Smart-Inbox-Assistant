package com.clinevo.inbox.ingestion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Properties;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import com.clinevo.inbox.audit.AuditService;
import com.clinevo.inbox.config.AppProperties;
import com.clinevo.inbox.domain.InboxRepository;

class IngestionServiceTest {

    private static final Session SESSION = Session.getInstance(new Properties());

    private IngestionService service(InboxRepository repo, Path storage, int maxAttachMb, int maxBodyChars) {
        AppProperties props = new AppProperties(storage.toString(), "reviewer-1",
                new AppProperties.Ingest(maxAttachMb, maxBodyChars),
                new AppProperties.Worker(1000, 1),
                new AppProperties.Ai("http://ai", 30, 10),
                new AppProperties.Mail(false, "h", 993, "u", "p", "INBOX", 1000));
        return new IngestionService(repo, mock(AuditService.class), props);
    }

    private MimeMessage eml(String raw) throws Exception {
        return new MimeMessage(SESSION, new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8)));
    }

    private InboxRepository repoReturningId(String id) {
        InboxRepository repo = mock(InboxRepository.class);
        when(repo.messageExists(any())).thenReturn(false);
        when(repo.insertMessage(any(), any(), any(), any(), any(Instant.class), any())).thenReturn(id);
        return repo;
    }

    /* ---- filename sanitisation ---- */

    @Test
    void stripsDirectoryComponents() {
        assertEquals("passwd", IngestionService.safeName("../../etc/passwd"));
        assertEquals("form.pdf", IngestionService.safeName("C:\\Users\\x\\form.pdf"));
    }

    @Test
    void keepsPlainNamesAndReplacesUnsafeChars() {
        assertEquals("ae_form.pdf", IngestionService.safeName("ae_form.pdf"));
        assertEquals("report_2025-09.pdf", IngestionService.safeName("report 2025-09.pdf"));
        assertFalse(IngestionService.safeName("a b;c|d.pdf").contains(";"));
        assertTrue(IngestionService.safeName(null).startsWith("attachment-"));
    }

    /* ---- body extraction (P2) ---- */

    @Test
    void multipartAlternativePrefersPlainText(@TempDir Path tmp) throws Exception {
        String raw = """
                From: a@x.test
                Subject: alt
                MIME-Version: 1.0
                Content-Type: multipart/alternative; boundary="b"

                --b
                Content-Type: text/plain; charset=UTF-8

                PLAIN version body
                --b
                Content-Type: text/html; charset=UTF-8

                <p>HTML <b>version</b> body</p>
                --b--
                """;
        InboxRepository repo = repoReturningId("1");
        service(repo, tmp, 25, 100000).ingest(eml(raw));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(repo).insertMessage(any(), isNull(), any(), any(), any(Instant.class), body.capture());
        assertTrue(body.getValue().contains("PLAIN version body"));
        assertFalse(body.getValue().contains("<p>"));
    }

    @Test
    void htmlOnlyBodyIsStrippedToText(@TempDir Path tmp) throws Exception {
        String raw = """
                From: a@x.test
                Subject: html
                MIME-Version: 1.0
                Content-Type: text/html; charset=UTF-8

                <html><body><h1>Reaction</h1><p>rash and swelling</p></body></html>
                """;
        InboxRepository repo = repoReturningId("1");
        service(repo, tmp, 25, 100000).ingest(eml(raw));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(repo).insertMessage(any(), isNull(), any(), any(), any(Instant.class), body.capture());
        assertFalse(body.getValue().contains("<"));
        assertTrue(body.getValue().contains("rash and swelling"));
    }

    @Test
    void bodyIsClampedToMaxChars(@TempDir Path tmp) throws Exception {
        String big = "x".repeat(5000);
        String raw = "From: a@x.test\nSubject: big\nContent-Type: text/plain\n\n" + big + "\n";
        InboxRepository repo = repoReturningId("1");
        service(repo, tmp, 25, 200).ingest(eml(raw));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(repo).insertMessage(any(), isNull(), any(), any(), any(Instant.class), body.capture());
        assertTrue(body.getValue().length() < 300);
        assertTrue(body.getValue().endsWith("[truncated]"));
    }

    /* ---- attachments (P2) ---- */

    @Test
    void oversizedAttachmentIsSkippedButMessageIsSaved(@TempDir Path tmp) throws Exception {
        String payload = "%PDF-1.4 " + "A".repeat(4000);
        String raw = """
                From: a@x.test
                Subject: big pdf
                MIME-Version: 1.0
                Content-Type: multipart/mixed; boundary="b"

                --b
                Content-Type: text/plain

                see attached
                --b
                Content-Type: application/pdf; name="huge.pdf"
                Content-Disposition: attachment; filename="huge.pdf"

                %s
                --b--
                """.formatted(payload);
        InboxRepository repo = repoReturningId("7");
        service(repo, tmp, 0, 100000).ingest(eml(raw));   // 0 MB cap -> everything is oversized

        verify(repo).insertMessage(any(), isNull(), any(), any(), any(Instant.class), any());
        ArgumentCaptor<String> reason = ArgumentCaptor.forClass(String.class);
        verify(repo).insertAttachment(eq("7"), eq("huge.pdf"), any(), any(), isNull(), eq(false), reason.capture());
        assertTrue(reason.getValue().contains("over size cap"));
    }

    @Test
    void nonPdfAttachmentIsLoggedNotStored(@TempDir Path tmp) throws Exception {
        String raw = """
                From: a@x.test
                Subject: docx
                MIME-Version: 1.0
                Content-Type: multipart/mixed; boundary="b"

                --b
                Content-Type: text/plain

                body
                --b
                Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="f.docx"
                Content-Disposition: attachment; filename="f.docx"

                ZScdata
                --b--
                """;
        InboxRepository repo = repoReturningId("3");
        service(repo, tmp, 25, 100000).ingest(eml(raw));

        ArgumentCaptor<String> reason = ArgumentCaptor.forClass(String.class);
        verify(repo).insertAttachment(eq("3"), eq("f.docx"), any(), any(), isNull(), eq(false), reason.capture());
        assertTrue(reason.getValue().contains("non-pdf"));
        verify(repo, never()).insertAttachment(any(), any(), any(), any(), any(String.class), anyBoolean(), any());
    }
}
