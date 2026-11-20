/**
 * Modulo do site: configuracoes que o dono edita na pagina de gestao (dados da loja, endereco, horarios,
 * textos da pagina inicial, servicos, numeros e taxa de entrega). Guardadas como um documento JSON validado.
 * API publica: {@link br.com.mundopet.site.SiteSettingsApi} (usada pela entrega para ler endereco e preco por km).
 */
@org.springframework.modulith.ApplicationModule(displayName = "Site")
package br.com.mundopet.site;
