package com.clinevo.inbox.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import com.clinevo.inbox.config.Constants;
import com.clinevo.inbox.domain.Documents.AuditEvent;

/** Only entry point for the audit trail. Inserts only, never updates or deletes. */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final MongoTemplate mongo;

    public AuditService(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    public void event(String messageId, String actor, String action,
                      String target, String oldValue, String newValue, String detailJson) {
        AuditEvent e = new AuditEvent();
        e.messageId = messageId;
        e.actor = actor;
        e.action = action;
        e.target = target;
        e.oldValue = oldValue;
        e.newValue = newValue;
        e.detailJson = detailJson;
        mongo.insert(e);
        log.info("Audit: message={} actor={} action={} target={}", messageId, actor, action, target);
    }

    public void ai(String messageId, String action, String target, String detailJson) {
        event(messageId, Constants.ACTOR_AI, action, target, null, null, detailJson);
    }
}
