package com.clinevo.inbox.ingestion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** Attachment filename sanitisation - blocks path traversal (HARDENING.md pillar 1). */
class IngestionServiceTest {

    @Test
    void stripsDirectoryComponents() {
        assertEquals("passwd", IngestionService.safeName("../../etc/passwd"));
        assertEquals("form.pdf", IngestionService.safeName("C:\\Users\\x\\form.pdf"));
    }

    @Test
    void keepsPlainNames() {
        assertEquals("ae_form.pdf", IngestionService.safeName("ae_form.pdf"));
        assertEquals("report_2025-09.pdf", IngestionService.safeName("report 2025-09.pdf"));
    }

    @Test
    void replacesUnsafeChars() {
        assertFalse(IngestionService.safeName("a b;c|d.pdf").contains(";"));
        assertTrue(IngestionService.safeName(null).startsWith("attachment-"));
        assertTrue(IngestionService.safeName("..").startsWith("attachment-"));
    }
}
