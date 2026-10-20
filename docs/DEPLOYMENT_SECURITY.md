# Publicação experimental: configuração simples

## Duas variáveis

No Vercel, projeto visionqc-mobile → Settings → Environment Variables → Production:

- `AI_GATEWAY_API_KEY`: chave de AI Gateway, como Secret.
- `VQC_ACCESS_PASSWORD`: senha aleatória de pelo menos 20 caracteres, como Secret.
  Usar uma senha diferente da chave de IA.

Fazer Redeploy. Na aplicação, Configurações → Acesso à inspeção remota → senha →
Liberar nesta sessão. Selecionar Jev, informar objeto/critérios e capturar.
A senha fica somente na memória da página; Bloquear acesso ou recarregar remove-a.
Redis não é necessário. Nenhum recurso adicional é provisionado.
Se `VQC_REMOTE_ENABLED=false` já estiver configurado, remover a variável ou
alterar para `true` e fazer Redeploy para liberar as capturas.

## Proteções e limites

As APIs publicadas exigem senha. POST também exige Origin igual ao Host;
Origin não substitui autenticação. Usar HTTPS. O acesso compartilhado serve
para um piloto, sem contas individuais nem auditoria por operador. Não
registrar Authorization, imagens ou credenciais em logs.

Há limites básicos de seis inspeções por minuto e sessenta por dia UTC em
cada instância ativa da função. Falhas/timeout do provedor consomem reserva.
Excesso retorna 429 com Retry-After. Podem ser ajustados opcionalmente por
`VQC_REQUESTS_PER_MINUTE` (1–60) e `VQC_REQUESTS_PER_DAY` (1–1000).
São contadores em memória: reinícios zeram os valores e outras instâncias
possuem contadores próprios. Portanto, NÃO são cotas globais nem teto financeiro.
Jev não tem retry/fallback; MDF conserva seus dois endpoints opcionais.

Para interromper chamadas, configurar `VQC_REMOTE_ENABLED=false` e fazer
Redeploy. Localhost mantém o fluxo de desenvolvimento sem senha, exceto com
`VQC_ENFORCE_ACCESS=true`; o interruptor de emergência também funciona localmente.

O controle financeiro precisa permanecer no painel da conta: verificar saldo,
elegibilidade do modelo, recargas desativadas e limites/orçamentos disponíveis.
Limitar capturas não garante custo zero. Não houve alteração da facturação.
[Preços AI Gateway](https://vercel.com/docs/ai-gateway/pricing).

## Arquivos publicados

`npm run build` gera `dist/` de uma lista explícita de nove arquivos runtime.
`vercel.json` publica somente `dist/`; funções de `api/` ficam no servidor.
`.vercelignore` exclui datasets, pesos, pesquisa, testes e credenciais do upload
CLI. Na integração Git, o build pode obter o repositório completo; a fronteira
pública é `dist/`. Dados locais são preservados. Exemplos de treinamento não
são publicados; importação manual do modelo próprio continua disponível.

## Verificação

Testes locais cobrem a lista pública exata, ausência de senha, senha inválida,
origem externa, limite por minuto/dia, concorrência na mesma instância,
reset das janelas, interrupção manual e bloqueio antes de chamar o provedor.
Os provedores são simulados. Jev continua experimental e exige avaliação real
antes de qualquer alegação de desempenho industrial.
