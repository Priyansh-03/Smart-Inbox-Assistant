package com.clinevo.inbox.ingestion;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Deterministic ingest path for demos and tests: upload .eml files instead of waiting for IMAP. */
@RestController
@RequestMapping("/api/import")
public class ImportController {

    private static final Logger log = LoggerFactory.getLogger(ImportController.class);
    private static final Session SESSION = Session.getInstance(new Properties());

    private final IngestionService ingestion;

    public ImportController(IngestionService ingestion) {
        this.ingestion = ingestion;
    }

    @PostMapping(value = "/eml", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<String> importEml(@RequestParam("files") MultipartFile[] files) throws Exception {
        List<String> ids = new ArrayList<>();
        for (MultipartFile f : files) {
            MimeMessage mime = new MimeMessage(SESSION, f.getInputStream());
            String id = ingestion.ingest(mime);
            log.info("Imported .eml {} -> message id={}", f.getOriginalFilename(), id);
            if (id != null) ids.add(id);
        }
        return ids;
    }

    @PostMapping("/eml-dir")
    public List<String> importDir(@RequestParam("path") String dir) throws IOException {
        List<String> ids = new ArrayList<>();
        try (var stream = Files.list(Path.of(dir))) {
            for (Path p : stream.filter(x -> x.toString().endsWith(".eml")).sorted().toList()) {
                try {
                    MimeMessage mime = new MimeMessage(SESSION, Files.newInputStream(p));
                    String id = ingestion.ingest(mime);
                    log.info("Imported {} -> message id={}", p.getFileName(), id);
                    if (id != null) ids.add(id);
                } catch (Exception e) {
                    log.error("Failed importing {}: {}", p, e.getMessage(), e);
                }
            }
        }
        return ids;
    }
}
