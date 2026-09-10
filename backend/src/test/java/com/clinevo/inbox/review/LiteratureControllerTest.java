package com.clinevo.inbox.review;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.clinevo.inbox.ai.AiClient;
import com.clinevo.inbox.ai.AiDtos;
import com.clinevo.inbox.audit.AuditService;
import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.InboxRepository;

/** Literature-screening upload: returns the full screening result and persists per-case facts. */
class LiteratureControllerTest {

    private MockMultipartFile pdf(String name) {
        return new MockMultipartFile("files", name, Constants.MIME_PDF, "%PDF-fake".getBytes());
    }

    private AiDtos.LiteratureResult result(boolean hasCase, AiDtos.LiteratureCase... cases) {
        return new AiDtos.LiteratureResult("art.pdf", "ARTICLE", "en", "summary",
                true, "why", hasCase, List.of(cases), List.of());
    }

    private AiDtos.LiteratureCase caseWith(String label) {
        return new AiDtos.LiteratureCase(label, "case text", true,
                List.of(new AiDtos.Fact("PATIENT", "age", "6", 0.9,
                        new AiDtos.Source("pdf", "art.pdf", 1, "6yo"))));
    }

    @Test
    void uploadReturnsScreeningResultAndPersistsFacts() throws Exception {
        InboxRepository repo = mock(InboxRepository.class);
        AiClient ai = mock(AiClient.class);
        when(repo.insertMessage(any(), any(), any(), any(), any(), any())).thenReturn("m1");
        when(ai.screenLiterature(any())).thenReturn(result(true, caseWith("Case 1")));

        var out = new LiteratureController(repo, ai, mock(AuditService.class)).upload(
                new MockMultipartFile[]{pdf("art.pdf")});

        assertEquals(1, out.size());
        assertEquals("m1", out.get(0).messageId());
        assertTrue(out.get(0).screening().hasPatientCase());
        assertEquals("Case 1", out.get(0).screening().cases().get(0).caseLabel());
        verify(repo).save(any(com.clinevo.inbox.domain.Documents.Fact.class));
        verify(repo).markMessage("m1", Constants.STATUS_READY, null, null);
    }

    @Test
    void multiCaseArticleReturnsOneEntryPerCase() throws Exception {
        InboxRepository repo = mock(InboxRepository.class);
        AiClient ai = mock(AiClient.class);
        when(repo.insertMessage(any(), any(), any(), any(), any(), any())).thenReturn("m1");
        when(ai.screenLiterature(any())).thenReturn(result(true, caseWith("Case 1"), caseWith("Case 2")));

        var out = new LiteratureController(repo, ai, mock(AuditService.class)).upload(
                new MockMultipartFile[]{pdf("art.pdf")});

        assertEquals(2, out.get(0).screening().cases().size());
        verify(repo, times(2)).save(any(com.clinevo.inbox.domain.Documents.Fact.class));
    }

    @Test
    void noPatientCaseStillReturnsSummaryAndReason() throws Exception {
        InboxRepository repo = mock(InboxRepository.class);
        AiClient ai = mock(AiClient.class);
        when(repo.insertMessage(any(), any(), any(), any(), any(), any())).thenReturn("m1");
        when(ai.screenLiterature(any())).thenReturn(result(false));

        var out = new LiteratureController(repo, ai, mock(AuditService.class)).upload(
                new MockMultipartFile[]{pdf("cohort.pdf")});

        assertEquals(1, out.size());
        assertTrue(out.get(0).screening().cases().isEmpty());
        assertEquals("why", out.get(0).screening().relevanceReason());
    }

    @Test
    void aiFailureIsPropagated() {
        InboxRepository repo = mock(InboxRepository.class);
        AiClient ai = mock(AiClient.class);
        when(repo.insertMessage(any(), any(), any(), any(), any(), any())).thenReturn("m1");
        when(ai.screenLiterature(any())).thenThrow(new RuntimeException("ai down"));

        assertThrows(RuntimeException.class, () -> new LiteratureController(repo, ai, mock(AuditService.class))
                .upload(new MockMultipartFile[]{pdf("art.pdf")}));
        verify(repo, times(0)).markMessage(eq("m1"), eq(Constants.STATUS_READY), any(), any());
    }
}
