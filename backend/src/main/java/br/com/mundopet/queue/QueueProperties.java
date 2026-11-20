package br.com.mundopet.queue;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("mundopet.queue")
public record QueueProperties(String stream, String deadLetterStream, String group, int concurrency,
                              int maxAttempts, Duration jobTimeout, Duration statusTtl, boolean workerEnabled) {
    public QueueProperties {
        if (stream == null) stream = "jobs";
        if (deadLetterStream == null) deadLetterStream = "jobs:dlq";
        if (group == null) group = "mundopet-api";
        if (concurrency <= 0) concurrency = 16;
        if (maxAttempts <= 0) maxAttempts = 3;
        if (jobTimeout == null) jobTimeout = Duration.ofSeconds(30);
        if (statusTtl == null) statusTtl = Duration.ofDays(1);
    }
}
