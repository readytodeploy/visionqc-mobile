# Publicação experimental e controle de consumo

## Conteúdo publicado

`npm run build` gera `dist/` a partir de uma lista explícita de nove arquivos
runtime. Somente HTML, CSS, JavaScript do cliente e perfis são públicos.
`vercel.json` publica `dist/`; funções em `api/` continuam no servidor.
`.vercelignore` também exclui datasets, pesos, artifacts, pesquisa, testes,
ambientes, arquivos de credenciais e dados de demonstração da transferência CLI.
Git integration pode obter o repositório completo para o build; a fronteira de
publicação é a lista explícita em `dist/`, não a exclusão de upload da CLI.
Os dados locais não foram apagados. Os exemplos de treinamento não são
publicados; a importação manual do modelo próprio continua disponível.

## Bloqueio e acesso

Em Vercel (`VERCEL=1`), as duas APIs remotas ficam bloqueadas por padrão.
Para liberar, configurar apenas no servidor:

- `VQC_REMOTE_ENABLED=true` (usar `false` como interruptor de emergência).
- `VQC_ACCESS_PASSWORD`: senha aleatória de pelo menos 20 caracteres,
  diferente da chave de IA. Não compartilhar a chave AI Gateway com operadores.
- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: banco Redis Upstash
  dedicado, com REST e execução Lua disponíveis. Sem contador, acesso bloqueado.
- `AI_GATEWAY_API_KEY` para Jev; Roboflow é opcional.

Na interface: Configurações → Acesso à inspeção remota → informar senha →
Liberar nesta sessão. A autorização Basic (usuário `inspector`) segue somente
para APIs da própria origem, via HTTPS no deploy. Fica na memória da página,
não em localStorage; Bloquear acesso ou recarregar remove-a. Isso é um acesso
compartilhado para piloto, sem identidades individuais ou trilha por operador.
A página estática pode ser vista sem senha; as chamadas remotas são restritas.
POST exige Origin igual ao Host, além da senha; Origin não autentica ninguém.
Não registrar cabeçalhos Authorization ou corpos das capturas em logs.

Localhost mantém o fluxo de desenvolvimento sem senha/Redis, exceto quando
`VQC_ENFORCE_ACCESS=true`. O interruptor `VQC_REMOTE_ENABLED=false` vale também
localmente. Não há opção de contornar o bloqueio de Vercel pelo navegador.

## Limites compartilhados

Padrão: seis inspeções por minuto e sessenta por dia UTC, compartilhadas entre
Jev, MDF, operadores e todas as instâncias/deployments usando o mesmo banco.
Variáveis: `VQC_REQUESTS_PER_MINUTE` (1–60) e `VQC_REQUESTS_PER_DAY` (1–1000).
A reserva é feita atomicamente em Lua antes da inferência; tentativas com erro
ou timeout também consomem reserva. A requisição negada retorna 429 e Retry-After.
Falha, timeout ou resposta inválida do contador retorna 503 sem chamar o modelo.
Somente contadores e chaves de janelas UTC são enviados ao Redis, nunca imagens,
senhas, nomes de objetos ou critérios. Não apagar/resetar esses contadores para
contornar a cota. Usar um banco dedicado e manter suas credenciais privadas.
Jev faz uma chamada por reserva, sem retry/fallback; MDF pode tentar seus dois
endpoints existentes. Redis também tem seus próprios limites/custos: verificar
o plano escolhido antes de habilitar. Nenhum recurso externo foi provisionado.

## Orçamento da conta

Limitar inspeções não equivale a um teto financeiro. O custo depende da imagem,
do modelo, de preços futuros e de outros aplicativos usando a mesma conta.
Antes de habilitar o piloto no painel AI Gateway:

1. Confirmar saldo gratuito, elegibilidade da conta/modelo e recarga desativada.
2. Usar credencial dedicada e restringir os modelos ao Jev escolhido quando
   esse controle estiver disponível na conta.
3. Configurar orçamento/limite de gasto no Gateway e acompanhar Logs/Spend.
   Conferir se o controle bloqueia chamadas ou apenas gera alerta.
4. Testar acesso negado, credencial válida, cota excedida e uma captura real
   autorizada antes de distribuir o endereço.

Essas configurações do painel ainda não foram alteradas nem verificadas nesta
sessão. Não há garantia de custo zero por código. Referências:
[REST Redis](https://upstash.com/docs/redis/features/restapi),
[AI Gateway Pricing](https://vercel.com/docs/ai-gateway/pricing).

## Verificação

Testes locais cobrem lista exata de arquivos públicos, bloqueio por falta de
configuração, senha inválida, origem externa, interrupção manual, reserva de
cota, 429 e falha segura do contador. Redis/provedores são simulados; não houve
provisionamento, implantação ou consumo de créditos. Validar Redis real e
comportamento de Vercel após configuração. O Jev continua experimental e exige
revisão humana; isso não constitui validação industrial.
