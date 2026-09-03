package com.clinevo.inbox;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.clinevo.inbox.config.AppProperties;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(AppProperties.class)
public class InboxApplication {
    public static void main(String[] args) {
        SpringApplication.run(InboxApplication.class, args);
    }
}
