package com.clinevo.inbox.worker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Section -> bucket mapping used when persisting extracted facts. Backs TODO.md TC6/TC7/TC9. */
class ProcessingWorkerTest {

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
