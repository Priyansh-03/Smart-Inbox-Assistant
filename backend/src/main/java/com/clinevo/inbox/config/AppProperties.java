package com.clinevo.inbox.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String storageDir,
        String reviewerId,
        Worker worker,
        Ai ai,
        Mail mail
) {
    public record Worker(long pollMs, int maxAttempts) {}

    public record Ai(String baseUrl, int timeoutSeconds) {}

    public record Mail(
            boolean enabled,
            String host,
            int port,
            String username,
            String password,
            String folder,
            long pollMs
    ) {}
}
