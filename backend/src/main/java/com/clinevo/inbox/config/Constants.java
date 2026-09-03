package com.clinevo.inbox.config;

/** Fixed values that never change at runtime. Everything rotatable lives in env. */
public final class Constants {

    private Constants() {}

    public static final String ACTOR_AI = "ai";

    public static final String STATUS_NEW = "NEW";
    public static final String STATUS_PROCESSING = "PROCESSING";
    public static final String STATUS_READY = "READY_FOR_REVIEW";
    public static final String STATUS_REVIEWED = "REVIEWED";
    public static final String STATUS_FAILED = "FAILED";

    public static final String REVIEW_AI = "AI";
    public static final String REVIEW_ACCEPTED = "ACCEPTED";
    public static final String REVIEW_OVERRIDDEN = "OVERRIDDEN";

    public static final String BUCKET_NOT_RELEVANT = "NOT_RELEVANT";

    public static final String MIME_PDF = "application/pdf";

    public static final int PDF_PAGE_CAP = 120;
}
