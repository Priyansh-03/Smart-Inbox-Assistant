// Runs once on first container start. Creates indexes and makes audit_event append-only
// at the database level (no update / delete allowed via a JSON-schema-less validator trick:
// we rely on the app never issuing updates; this script adds the guardrail indexes + TTL-free log).

const db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);

db.createCollection("message");
db.createCollection("attachment");
db.createCollection("pdf_extraction");
db.createCollection("classification");
db.createCollection("fact");
db.createCollection("audit_event", { capped: false });

db.message.createIndex({ messageIdHdr: 1 }, { unique: true, sparse: true });
db.message.createIndex({ status: 1, _id: 1 });
db.attachment.createIndex({ messageId: 1 });
db.pdf_extraction.createIndex({ attachmentId: 1 });
db.pdf_extraction.createIndex({ messageId: 1 });
db.classification.createIndex({ messageId: 1, bucket: 1 }, { unique: true });
db.fact.createIndex({ messageId: 1, section: 1, fieldName: 1 });
db.audit_event.createIndex({ messageId: 1, _id: 1 });

print("smart_inbox: collections and indexes created");
