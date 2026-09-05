package com.clinevo.inbox.worker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;

import com.clinevo.inbox.ai.AiClient;
import com.clinevo.inbox.audit.AuditService;
import com.clinevo.inbox.config.AppProperties;
import com.clinevo.inbox.domain.InboxRepository;

/** Section -> bucket mapping + the stuck-message reaper (P7). Backs TODO.md TC6/TC7/TC9/EC-stuck. */
class ProcessingWorkerTest {

    private AppProperties props(int stuckSeconds) {
        return new AppProperties("/tmp", "r", new AppProperties.Ingest(25, 1000),
                new AppProperties.Worker(1000, 2, stuckSeconds),
                new AppProperties.Ai("http://ai", 30, 10),
                new AppProperties.Mail(false, "h", 993, "u", "p", "INBOX", 1000));
    }

    @Test
    void reaperRequeuesStuckMessagesWithTheConfiguredTimeout() {
        InboxRepository repo = mock(InboxRepository.class);
        new ProcessingWorker(repo, mock(AiClient.class), mock(AuditService.class), props(300)).reap();
        verify(repo).reapStuck(300);
    }

    @Test
    void complaintSectionMapsToPqc() {
        assertEquals("PQC", ProcessingWorker.bucketFor("COMPLAINT"));
    }

    @Test
    void questionSectionMapsToMi() {
        assertEquals("MI", ProcessingWorker.bucketFor("QUESTION"));
    }

    @Test
    void patientAndReactionSectionsMapToIcsr() {
        assertEquals("ICSR", ProcessingWorker.bucketFor("PATIENT"));
        assertEquals("ICSR", ProcessingWorker.bucketFor("REACTION"));
        assertEquals("ICSR", ProcessingWorker.bucketFor(null));
    }
}
