package com.clinevo.inbox.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AppProperties props;
    private final String allowedOrigin;

    public WebConfig(AppProperties props, @Value("${app.cors.allowed-origin}") String allowedOrigin) {
        this.props = props;
        this.allowedOrigin = allowedOrigin;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins(allowedOrigin)
                .allowedMethods("GET", "POST", "PATCH", "PUT", "DELETE");
    }

    @Bean
    RestClient aiRestClient() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(props.ai().connectTimeoutSeconds()));
        factory.setReadTimeout(Duration.ofSeconds(props.ai().timeoutSeconds()));
        return RestClient.builder().baseUrl(props.ai().baseUrl())
                .requestFactory(factory).build();
    }
}
