package br.com.mundopet.files;

import reactor.core.publisher.Mono;

public interface StorageService {

    /** Salva o objeto e devolve a chave usada. */
    Mono<String> upload(String key, byte[] data, String contentType);

    /** Emite NotFoundException se a chave nao existir. */
    Mono<StoredObject> download(String key);

    Mono<Void> delete(String key);
}
