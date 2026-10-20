# Arquitetura de modelos por produto — VisionQC

## Perfis
| Perfil | Estado | Modelo | Inferência |
| --- | --- | --- | --- |
| Molduras MDF | Integrado, **não validado em produção** | Roboflow RF-DETR V3 | `/api/roboflow` |
| Tecidos e revestimentos | Precisa de dataset/treinamento | Nenhum | Bloqueada |
| Colchões e capas | Precisa de dataset/treinamento | Nenhum | Bloqueada |
| Sofás e estofados | Precisa de dataset/treinamento | Nenhum | Bloqueada |

Os metadados dos perfis estão em `config/model-profiles.json`. O seletor visível encontra-se em **Supervisor → Configurações → Produto inspecionado**. O perfil é salvo no navegador usando a chave `vqc_inspection_profile`.

O servidor também valida o perfil. Não envie um produto têxtil ao detector de molduras MDF; resultados seriam enganadores. O modelo MDF só estará efetivamente operacional após teste das credenciais, endpoint e retorno com amostras reais.

## Plano para ativar cada novo perfil
1. Reunir imagens de produção variadas (luz, ângulos, defeitos reais e peças boas); definir consentimento/licença de uso.
2. Separar conjuntos **treino / validação / teste por peça ou lote**, evitando fotos quase idênticas entre grupos.
3. Rotular tipos de defeito com **bounding boxes ou máscaras**, criar guia de anotação e revisar qualidade. Para defeitos desconhecidos, avaliar anomalias treinadas apenas em peças boas.
4. Treinar e exportar versão identificável do modelo (Roboflow, ONNX ou outro provedor). Não registrar como **ready** sem endpoint ou artefato comprovadamente acessível.
5. Medir **recall por classe**, falsos negativos, precisão, latência, resultados por textura/material e condições de iluminação. Comparar com critérios de qualidade acordados na fábrica.
6. Adicionar variável de ambiente/identificador de modelo por perfil no backend, allowlist segura e rotas de inferência específicas. Testar rollback e registrar versão usada em cada inspeção.
7. Atualizar `config/model-profiles.json` e as opções do frontend apenas após validação.

## Limitações atuais
- Não existe dataset rotulado fornecido especificamente para têxteis, colchões ou sofás.
- Modelos locais MobileNet e PatchCore Lite não equivalem a detectores profundos treinados para cada categoria.
- Os recortes e caixas desenhados no navegador indicam localizações previstas pelo modelo, não comprovam defeitos.
- Não há monitoramento automático contínuo para inferência remota; o Roboflow atual usa captura manual.
- O arquivo JSON do catálogo é documentação versionada; o frontend espelha metadados mínimos e o backend faz verificação explícita. Futuramente migrar para uma fonte de configuração única com validação de schema.

## Revisão do pipeline de pesquisa (20/10/2026)

A separação por produto e o bloqueio de perfis não treinados devem ser mantidos.
StitchingNet treina classificação de recortes de costura; não fornece localização
precisa nem comprova transferência para colchões/estofados. O split anterior
embaralhava imagens dentro de tecido/classe e não isolava sequências.

O trainer agora audita todas as imagens antes de carregar TensorFlow, exige
manifesto `path,group` por peça/lote/sessão, isola grupos e rejeita duplicatas
exatas de pixels entre grupos. Toda partição precisa conter todas as classes.
A proporção 70/15/15 é por quantidade de grupos, sem garantia de equilíbrio por
imagem. Falta de cobertura interrompe o treino; não ajuste o split usando o
resultado do teste. Congele o manifesto antes de experimentar modelos.

A auditoria exige 14.565 imagens válidas, 11 classes e 11 tecidos, conforme a
publicação, além de dimensões 224×224. Essas contagens são verificações de
consistência, não prova de autenticidade ou completude sem inventário oficial.
Estrutura, contagens e nomes de diretório foram auditados no conjunto completo
(ver `DATASET_AUDIT.md`). Metadados de sequência e imagens quase idênticas
ainda precisam de revisão. Hashes não detectam
frames vizinhos. Identificadores de grupo devem vir da aquisição, não de
numeração presumida de arquivos. Sem metadados confiáveis, não há avaliação
independente comprovada.

Saídas de pesquisa incluem auditoria, manifests com hashes, matriz de confusão,
accuracy, macro F1 e precisão/recall/F1, suporte e falsos negativos por classe.
`production_ready` permanece falso mesmo após gerar métricas. A promoção exige
licença adequada, critérios de aceitação da fábrica e validação externa por
produto, material, iluminação, latência e integração real. Nenhum perfil foi ativado.

## Primeiro classificador têxtil experimental

Em 20/10/2026 foi treinado um classificador de 11 classes de costura com tecidos
inteiros reservados. Accuracy 31,69%, F1 macro 0,2408; resultado insuficiente.
Ver `TEXTILE_TRAINING_RESULTS.md`. O perfil textil continua bloqueado na aplicação;
o artefato de pesquisa não foi integrado e não habilita produção.

## Mudança de abordagem: Jev

A integração visual experimental do Jev é uma alternativa remota separada dos
modelos treinados: ver `JEV_INTEGRATION.md`. Não exige treinar pesos locais.
Captura somente a região do visor, preserva revisão humana e usa apenas caixas
retornadas e validadas. Requer chave oficial do servidor; ainda não houve teste
real com a conta nem validação industrial.
