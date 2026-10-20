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
