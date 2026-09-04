package com.clinevo.inbox.ai;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class AiClient {

    private final RestClient client;

    public AiClient(RestClient aiRestClient) {
        this.client = aiRestClient;
    }

    public AiDtos.ProcessResponse process(AiDtos.ProcessRequest req) {
        return client.post()
                .uri("/ai/v1/process")
                .contentType(MediaType.APPLICATION_JSON)
                .body(req)
                .retrieve()
                .body(AiDtos.ProcessResponse.class);
    }
}
