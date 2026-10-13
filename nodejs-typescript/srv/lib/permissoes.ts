/**
 * Permissões do usuário logado, servidas pelo singleton Permissoes dos
 * serviços de cadastro (Clientes e Estoque). A UI usa somenteLeitura para
 * esconder Criar, Editar, Excluir, Importar e as ações; o @restrict do
 * serviço continua barrando a alteração no backend.
 */
import type { Request } from '@sap/cds'

/** Papel que pode alterar os cadastros (os demais só consultam). */
export const PAPEL_ALTERACAO = 'Admin'

/**
 * Conteúdo do singleton Permissoes para o usuário da requisição.
 * @param req leitura do singleton
 * @returns somenteLeitura true quando o usuário não tem o papel PAPEL_ALTERACAO
 */
export function permissoesDoUsuario(req: Request): { somenteLeitura: boolean } {
  return { somenteLeitura: !req.user.is(PAPEL_ALTERACAO) }
}
