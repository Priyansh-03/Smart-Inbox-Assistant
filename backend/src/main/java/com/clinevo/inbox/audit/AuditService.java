package com.clinevo.inbox.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.clinevo.inbox.config.Constants;

/** Only entry point for the audit trail. Inserts only, never updates or deletes. */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final JdbcClient jdbc;

    public AuditService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void event(String messageId, String actor, String action,
                      String target, String oldValue, String newValue, String detailJson) {
        jdbc.sql("""
                INSERT INTO audit_event (message_id, actor, action, target, old_value, new_value, detail_json)
                VALUES (:m, :actor, :action, :target, :old, :new, CAST(:detail AS jsonb))
                """)
                .param("m", messageId == null ? null : Long.valueOf(messageId))
                .param("actor", actor).param("action", action).param("target", target)
                .param("old", oldValue).param("new", newValue).param("detail", detailJson)
                .update();
        log.info("Audit: message={} actor={} action={} target={}", messageId, actor, action, target);
    }

    public void ai(String messageId, String action, String target, String detailJson) {
        event(messageId, Constants.ACTOR_AI, action, target, null, null, detailJson);
    }
}
