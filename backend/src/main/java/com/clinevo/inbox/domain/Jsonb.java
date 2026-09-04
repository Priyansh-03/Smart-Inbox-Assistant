package com.clinevo.inbox.domain;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/** JSON <-> String for jsonb columns. Bound as text, cast to jsonb in SQL. */
final class Jsonb {

    private static final ObjectMapper M = new ObjectMapper();

    private Jsonb() {}

    static String write(Object value) {
        if (value == null) return null;
        try {
            return M.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("jsonb serialize failed", e);
        }
    }

    static <T> T read(String json, TypeReference<T> type) {
        if (json == null || json.isBlank()) return null;
        try {
            return M.readValue(json, type);
        } catch (Exception e) {
            throw new IllegalStateException("jsonb deserialize failed", e);
        }
    }
}
