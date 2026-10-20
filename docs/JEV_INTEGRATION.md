# Jev: contrato direto TypeSafe AI

Atualizado em 20/10/2026. O Gateway da Vercel rejeitou Jev 1.14 no nível gratuito
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
Com a câmera ativa, somente a moldura quadrada de 448×448 é enviada, como JPEG.
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

- Oito testes locais passaram, cobrindo inicialização, perfis, segurança das
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
