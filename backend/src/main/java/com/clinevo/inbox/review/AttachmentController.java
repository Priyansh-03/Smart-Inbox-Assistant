package com.clinevo.inbox.review;

import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.clinevo.inbox.domain.Documents.PdfExtraction;
import com.clinevo.inbox.domain.InboxRepository;

/** Streams the stored PDF so the reviewer UI can open it at a given page. */
@RestController
@RequestMapping("/api/attachments")
public class AttachmentController {

    private static final Logger log = LoggerFactory.getLogger(AttachmentController.class);

    private final InboxRepository repo;

    public AttachmentController(InboxRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/{messageId}/{filename}")
    public ResponseEntity<Resource> file(@PathVariable String messageId, @PathVariable String filename) {
        PdfExtraction pe = repo.pdfExtractions(messageId).stream()
                .filter(p -> filename.equals(p.filename)).findFirst().orElse(null);
        if (pe == null) {
            log.warn("Attachment {} not found for message {}", filename, messageId);
            return ResponseEntity.notFound().build();
        }
        Path path = repo.processableAttachments(messageId).stream()
                .filter(a -> filename.equals(a.filename)).map(a -> Path.of(a.storagePath)).findFirst().orElse(null);
        if (path == null || !Files.exists(path)) return ResponseEntity.notFound().build();
        log.info("Serving attachment {} for message {}", filename, messageId);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(new FileSystemResource(path));
    }
}
