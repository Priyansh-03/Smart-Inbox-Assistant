package com.clinevo.inbox.ingestion;

import java.util.Properties;

import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.UIDFolder;
import jakarta.mail.internet.MimeMessage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.clinevo.inbox.config.AppProperties;
import com.clinevo.inbox.domain.InboxRepository;

/** Polls an IMAP folder by UID cursor (not the \Seen flag) and hands each new message to IngestionService. */
@Component
@ConditionalOnProperty(value = "app.mail.enabled", havingValue = "true")
public class MailPoller {

    private static final Logger log = LoggerFactory.getLogger(MailPoller.class);

    private final AppProperties.Mail cfg;
    private final IngestionService ingestion;
    private final InboxRepository repo;

    public MailPoller(AppProperties props, IngestionService ingestion, InboxRepository repo) {
        this.cfg = props.mail();
        this.ingestion = ingestion;
        this.repo = repo;
    }

    @Scheduled(fixedDelayString = "${app.mail.poll-ms}")
    public void poll() {
        Properties p = new Properties();
        p.put("mail.store.protocol", "imaps");
        p.put("mail.imaps.host", cfg.host());
        p.put("mail.imaps.port", String.valueOf(cfg.port()));

        Store store = null;
        Folder folder = null;
        try {
            Session session = Session.getInstance(p);
            store = session.getStore("imaps");
            store.connect(cfg.host(), cfg.username(), cfg.password());
            folder = store.getFolder(cfg.folder());
            folder.open(Folder.READ_WRITE);
            UIDFolder uf = (UIDFolder) folder;

            long[] cursor = repo.mailboxCursor(cfg.folder());
            long savedValidity = cursor[0];
            long lastUid = cursor[1];
            long validity = uf.getUIDValidity();
            if (savedValidity != 0 && savedValidity != validity) {
                log.warn("Mailbox {} UIDVALIDITY changed {} -> {}, replaying from start", cfg.folder(), savedValidity, validity);
                lastUid = 0;
            }

            Message[] batch = uf.getMessagesByUID(lastUid + 1, UIDFolder.LASTUID);
            long maxUid = lastUid;
            int ingested = 0;
            for (Message m : batch) {
                long uid = uf.getUID(m);
                if (uid <= lastUid) continue;                 // JavaMail returns the last msg when none are newer
                try {
                    String id = ingestion.ingest((MimeMessage) m, uid);
                    m.setFlag(Flags.Flag.SEEN, true);         // courtesy only, not authoritative
                    if (id != null) ingested++;
                    log.info("Mail poll: uid={} -> message id={}", uid, id);
                } catch (RuntimeException e) {
                    log.error("Mail poll: uid={} failed: {}", uid, e.getMessage(), e);
                }
                maxUid = Math.max(maxUid, uid);
            }
            if (maxUid > lastUid || savedValidity != validity) {
                repo.saveMailboxCursor(cfg.folder(), validity, maxUid);
            }
            log.info("Mail poll: {} new message(s) ingested from {} (lastUid now {})", ingested, cfg.folder(), maxUid);
        } catch (Exception e) {
            log.error("Mail poll failed: {}", e.getMessage(), e);
        } finally {
            try { if (folder != null && folder.isOpen()) folder.close(false); } catch (Exception ignore) { }
            try { if (store != null) store.close(); } catch (Exception ignore) { }
        }
    }
}
