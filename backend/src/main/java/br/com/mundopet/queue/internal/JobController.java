package br.com.mundopet.queue.internal;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import br.com.mundopet.queue.JobQueue;
import br.com.mundopet.queue.JobStatus;
import br.com.mundopet.shared.NotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/jobs")
class JobController {

    record EnqueueRequest(@NotBlank @Size(max = 100) String type, @Size(max = 10_000) String payload) {
    }

    private final JobQueue queue;

    JobController(JobQueue queue) {
        this.queue = queue;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    Mono<Map<String, String>> enqueue(@Valid @RequestBody EnqueueRequest req) {
        return queue.enqueue(req.type(), req.payload()).map(id -> Map.of("id", id));
    }

    @GetMapping("/{id}")
    Mono<JobStatus> status(@PathVariable String id) {
        return queue.status(id).switchIfEmpty(Mono.error(new NotFoundException("Job nao encontrado: " + id)));
    }
}
