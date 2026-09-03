package com.clinevo.inbox.ingestion;

import java.util.Properties;

import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.search.FlagTerm;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.clinevo.inbox.config.AppProperties;

/** Polls an IMAP folder for unseen mail and hands each message to IngestionService. */
@Component
@ConditionalOnProperty(value = "app.mail.enabled", havingValue = "true")
public class MailPoller {

    private static final Logger log = LoggerFactory.getLogger(MailPoller.class);

    private final AppProperties.Mail cfg;
    private final IngestionService ingestion;

    public MailPoller(AppProperties props, IngestionService ingestion) {
        this.cfg = props.mail();
        this.ingestion = ingestion;
    }

    @Scheduled(fixedDelayString = "${app.mail.poll-ms}")
    public void poll() {
        Properties p = new Properties();
        p.put("mail.store.protocol", "imaps");
        p.put("mail.imaps.host", cfg.host());
        p.put("mail.imaps.port", String.valueOf(cfg.port()));
        try {
            Session session = Session.getInstance(p);
            Store store = session.getStore("imaps");
            store.connect(cfg.host(), cfg.username(), cfg.password());
            Folder folder = store.getFolder(cfg.folder());
            folder.open(Folder.READ_WRITE);
            Message[] unseen = folder.search(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
            log.info("Mail poll: {} unseen message(s) in {}", unseen.length, cfg.folder());
            for (Message m : unseen) {
                try {
                    String id = ingestion.ingest((MimeMessage) m);
                    m.setFlag(Flags.Flag.SEEN, true);
                    log.info("Mail poll: message flagged seen (id={})", id);
                } catch (RuntimeException e) {
                    log.error("Mail poll: failed on one message: {}", e.getMessage(), e);
                }
            }
            folder.close(false);
            store.close();
        } catch (Exception e) {
            log.error("Mail poll failed: {}", e.getMessage(), e);
        }
    }
}
