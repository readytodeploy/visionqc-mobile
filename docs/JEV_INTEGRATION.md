# Jev: inspeção visual experimental

Implementação em 20/10/2026. A [documentação oficial](https://docs.typesafe.ai/images)
permite imagens, mas ainda não considera Images/Box prontos para produção.
[Box](https://docs.typesafe.ai/primitives/box) requer Jev 1.14 e sempre retorna
coordenadas, mesmo quando o alvo não existe. Portanto, uma caixa sozinha não
constitui evidência de defeito.

## Fluxo implementado

Configurações → Modelo de avaliação → Jev → definir objeto e defeitos.
Capturar ativa a câmera; com câmera ativa, envia o quadrado dentro da moldura
(448×448 JPEG) ao backend `/api/jev`. O backend usa exclusivamente o endpoint
do Vercel AI Gateway `https://ai-gateway.vercel.sh/typesafe/v1/systemone`,
versão fixada `typesafe-ai/jev-1.14.0`, com
`TypeSafe-Danger-Zone-Images: true`. Não há fallback direto ao provedor nem repetição automática de chamadas.

Perguntas independentes: indício de defeito, tipo de defeito e região sugerida.
A política local exige confiança de decisão ≥0,85 e de tipo ≥0,70 para apontar
possível defeito; região só aparece com coordenadas válidas dentro de [0,1] e
confiança Box ≥0,70. Limiares são hipóteses de protótipo, não valores validados
na fábrica. Ausência de defeito, ambiguidade e inconsistência levam à revisão.
Nenhum resultado aprova automaticamente uma peça. Uma pergunta Box retorna
apenas uma região; esta implementação não faz inventário completo de defeitos.

Snapshot e região sugerida usam o mesmo retângulo do visor; são reposicionados
quando ele muda de tamanho. Não se desenham caixas quando faltam evidências.
Após o resultado, Capturar/Nova inspeção libera o próximo ciclo. Requisições
pendentes são descartadas se o perfil ou a sessão de câmera mudar. Histórico
registra provedor, versão, decisão e estado experimental.

Não há treino local no modo Jev; a aba Treino informa isso. MobileNet não é
carregada para essa captura. Perfis têxteis treináveis continuam sem ativação;
o modo Jev é separado e experimental.

## Configuração local

1. Obter uma chave AI Gateway no painel Vercel, mantendo o plano gratuito.
2. Criar `.env.local` na raiz usando `.env.example` e preencher `AI_GATEWAY_API_KEY`.
   Não inserir a chave no chat, em campos da interface ou em arquivos versionados.
3. Reiniciar `npm run dev` e abrir `http://localhost:8766/`.
4. Selecionar Jev e testar com imagens autorizadas, medindo falsos negativos,
   recall por defeito, precisão da localização e latência antes de uso real.

Em Vercel, usar uma credencial de servidor AI Gateway ou o `VERCEL_OIDC_TOKEN`
disponibilizado pela plataforma. A captura envia a imagem pelo Gateway à TypeSafe AI; o aviso está visível nas configurações. Não foi
realizada chamada externa ou uso de créditos nesta sessão, pois falta a chave.

O servidor local novo serve somente index, assets, JS e config, além das duas
rotas de API. `.env*`, datasets, artifacts e código de treinamento não são
servidos. O servidor Python estático anterior foi encerrado.

## Plano gratuito

Consulta em 20/10/2026: o [catálogo gratuito](https://vercel.com/ai-gateway/models?freeTier=true)
inclui Jev 1.14. O alias `typesafe-ai/jev` declara somente texto no catálogo;
por isso a versão com suporte declarado a imagens está fixada. A
[compatibilidade TypeSafe](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)
preserva o formato de requisição, mas Images/Box ainda precisa de teste real.
A [tarifação](https://vercel.com/docs/ai-gateway/pricing) inclui US$5 mensais
para modelos elegíveis, com limites. Comprar créditos muda para o nível pago
e encerra a franquia gratuita mensal. Esta implementação não compra créditos,
não configura recarga e não troca para outro modelo em caso de falha.
Respostas 402, 403 e 429 interrompem a captura e orientam consultar o painel.
Não há garantia de gratuidade ilimitada nem controle de cobrança da conta no app.

## Verificação observada

- `npm test`: cinco testes passaram, com múltiplas asserções.
- Jev: payload inválido, formato/dimensões, perfil, origem, ausência de chave,
  destino fixo, resposta malformada, erros sem exposição de credencial, revisão
  sem caixa e caixas inválidas testados com provedor simulado.
- Fluxo frontend com câmera simulada: ROI, ausência de treino local, revisão,
  região sugerida e nova captura sem refresh.
- HTTP real local: GET `/api/jev` → 200, `configured:false`; cliente JS → 200;
  payload inválido → 400; `.env.local` e dataset → 404.
- Navegador: seleção Jev, objeto/critérios e pendência de credencial visíveis.

**Não verificados:** autenticação real, disponibilidade do modelo para a conta,
retorno real de Images/Box, qualidade industrial e funcionamento com câmera
física. O sistema não foi implantado. Nenhuma métrica de StitchingNet equivale
a uma avaliação do Jev.
