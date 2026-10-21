# Jev: contrato direto TypeSafe AI

Atualizado em 21/10/2026. O Gateway da Vercel rejeitou Jev 1.14 no nível gratuito
com 403 RestrictedModelsError. O usuário contratou diretamente a TypeSafe AI.

## Configuração e fluxo

O backend `/api/jev` usa exclusivamente `https://api.typesafe.ai/v1/systemone`,
modelo fixo `jev-1.14.0`, com `AI_JEV_API_KEY` no servidor. Não usa
AI_GATEWAY_API_KEY, OIDC ou fallback. `.env.example` tem somente um placeholder
vazio; a chave fornecida foi transferida para `.env.local`, fora de Git.
Em Vercel, AI_JEV_API_KEY é um Secret de Production; requer novo deployment.
VQC_ACCESS_PASSWORD e os limites básicos por instância continuam em vigor.
Ver DEPLOYMENT_SECURITY.md.

Configurações → Jev → objeto e defeitos → liberar acesso → Capturar.
Com a câmera ativa, a imagem inteira da câmera é enviada como JPEG, com proporção preservada e
lado maior limitado a 1536 pixels, sem recorte central.
Não carrega o modelo local nem treina pesos nesse modo. O progresso e os erros
ficam visíveis abaixo do visor; a próxima captura não exige recarregar a página.
A captura transmite a imagem diretamente à TypeSafe AI, com aviso na interface.

Images/Box são experimentais na [documentação TypeSafe](https://docs.typesafe.ai/images).
O header TypeSafe-Danger-Zone-Images: true é obrigatório. Box requer Jev 1.14
e sempre pode retornar coordenadas, mesmo sem alvo. Portanto a caixa não é
usada como evidência independente. São feitas perguntas de presença, tipo e
região: decisão ≥0,85 e tipo ≥0,70 para sinalizar possível defeito, mais Box
≥0,70 e coordenadas válidas para mostrar região sugerida. Limiares ainda não
foram validados na fábrica. Só há uma região, não um inventário completo.
Sem defeito aparente, ambiguidade ou inconsistência levam à revisão humana.
Nenhum resultado aprova automaticamente uma peça.

## Verificação

- Nove testes locais passaram, cobrindo inicialização, perfis, segurança das
  APIs, autenticação, payload, política de caixas e feedback de captura.
- Chaves antigas do Gateway e OIDC não habilitam a rota direta.
- Uma chamada real à API direta, com JPEG sintético uniforme de 448×448,
  retornou HTTP 200, modelo jev-1.14.0. A resposta foi normalizada como
  assessment=clear, verdict=review, sem caixa exibida, production_ready=false.
  O payload incluiu Images e Box e nenhuma imagem privada do usuário.
- Isso confirma acesso/formato da API; não mede acurácia, recall, localização
  real nem funcionamento com a câmera física. Não é validação industrial.

Falhas de credencial do provedor retornam erro distinto do login da aplicação.
Erros não expõem chave ou corpo bruto do provedor, e não há repetição automática
ou troca para provedor/modelo pago alternativo. Custos seguem o contrato direto.

## Prompt inspection-v2

Seis perguntas independentes na mesma chamada: qualidade da captura, correspondência
do objeto, natureza da evidência, decisão, tipo e região. Instruções e cenários
explicitam defeitos físicos, variações normais e artefatos de imagem, sem inferir
medidas, defeitos ocultos, causas ou conformidade sem referência. Dados do usuário
e texto na imagem não podem substituir a política. A taxonomia inclui costura,
linha solta, trama, mancha, rasgo/furo, abrasão/risco, deformação, acabamento e dano.
Há opções other/none/uncertain para evitar classificação forçada.

Uma sinalização exige qualidade usable ≥0,70, objeto matches ≥0,70 e evidência
physical ≥0,75, além dos limiares de decisão/tipo/Box anteriores. Qualquer falha
de qualidade/escopo/evidência impede mostrar caixa como defeito. A tela informa
o motivo de revisão, e o histórico guarda a versão do prompt e as categorias.
Esses limiares são heurísticos; não há melhora de acurácia demonstrada sem teste
comparativo em fotos reais rotuladas e independentes. As seis perguntas aumentam
o uso de tokens em relação ao prompt anterior. Critérios personalizados salvos
são preservados; somente os textos padrão antigos são substituídos.

## Captura e resultados v3 (21/10/2026)

O visor Jev usa contain: exibe todos os pixels, inclusive bordas, com barras
quando a proporção da câmera difere da tela. O quadro congelado aparece antes
da resposta; é o mesmo JPEG enviado, não uma foto posterior. A câmera solicita
1920×1080 como preferência; resoluções reais dependem do dispositivo. O envio
preserva a proporção, não amplia artificialmente e limita o lado maior a 1536.
JPEG é tentado em qualidade 0,90, 0,82 e 0,72 para respeitar o limite local de
1,8 milhão de caracteres. Miniaturas do histórico têm lado maior de 320 pixels.

O prompt inspection-v3-full-frame solicita varrer a imagem inteira, incluindo
bordas, e recebe as dimensões verificadas no JPEG. Continua sendo uma chamada
por captura; a imagem maior pode aumentar tokens/custo e latência. Não há
chamadas automáticas adicionais ou mudança silenciosa dos limiares.

Resultados separados: possível defeito, sem defeito aparente, refazer captura,
conferir objeto e revisão manual. Sem defeito aparente exige concordância positiva
de qualidade/objeto/ausência de evidência; permanece verdict=review e nunca
aprova a peça. Regiões desenhadas provêm do Box validado; o botão Ampliar região
sugerida usa a foto congelada e as coordenadas retornadas. Uma nova pressão em
Capturar já inicia a próxima análise, sem uma pressão intermediária para limpar.

Testes verificam todos os pixels de origem, proporções horizontal/vertical,
resolução 4K reduzida, mapeamento da região no visor, foto congelada antes da
resposta, mensagens distintas, erro e repetição de captura. A mudança corrige
perda de contexto/detalhe; não comprova ganho de precisão industrial sem uma
avaliação comparativa em fotos reais rotuladas.

Smoke test real da rota atualizada: JPEG sintético 1536×864 aceito com HTTP 200,
prompt inspection-v3-full-frame, outcome=recapture, assessment=uncertain,
verdict=review, sem caixa. A imagem uniforme não é um conjunto de avaliação: o
resultado confirma contrato/formato e recusa segura, não desempenho em produtos.
