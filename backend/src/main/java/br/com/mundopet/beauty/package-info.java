/**
 * Modulo Espaco Beleza: galeria de fotos dos pets atendidos (imagens no MinIO, reprocessadas e sem metadados)
 * e depoimentos de clientes com moderacao. A clinica gerencia tudo pelas rotas /api/beauty/admin (token).
 * Nao expoe API para outros modulos; tudo fica em {@code internal}.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Espaco Beleza")
package br.com.mundopet.beauty;
