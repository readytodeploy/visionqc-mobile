# StitchingNet: treinamento experimental para VisionQC

Fonte: https://github.com/hyungjungkim/StitchingNet

**Licença:** CC BY-NC 4.0. Somente uso **não comercial** sem autorização adicional dos titulares. Não incluir imagens, pesos derivados ou dados em deployments comerciais do VisionQC sem análise da licença e permissão apropriada.

O artigo descreve 14.565 imagens (224×224), 11 tecidos e 11 categorias (normal + dez defeitos). O repositório contém apenas 114 imagens de amostra e um notebook. Baixe o conjunto completo via [Kaggle](https://www.kaggle.com/datasets/hyungjung/stitchingnet-dataset) ou [Mendeley](https://data.mendeley.com/datasets/6tdthsjgfc/1), respeitando os termos.

## Treinamento local (pesquisa)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r training/requirements.txt
python training/train_stitchingnet.py --data /caminho/StitchingNet --epochs 20
```

Diretórios esperados: `<DATASET>/<tipo_tecido>/<classe>/*.jpg`, conforme o notebook original. Inspecione a estrutura baixada antes de executar.

Saídas: `artifacts/stitchingnet/model.keras`, `metrics.json`, e CSVs com a divisão. O script não altera as rotas de produção nem ativa um perfil de IA no app.

**Limitações:** classificador de imagem/recorte, não detector de bounding boxes. Uma avaliação robusta exige split por sequência/sessão/lote (metadados de agrupamento) para evitar vazamento; o split estratificado por tecido e classe deste primeiro experimento não garante independência entre frames próximos. Também faltam imagens reais de colchões e sofás para validar transferência de domínio.

**Ativação futura:** após licença adequada e validação, exportar modelo para inferência (ex.: TensorFlow.js/ONNX), incorporar pré-processamento idêntico ao treino e registrar versão por perfil. Não classificar automaticamente superfícies completas a partir de um classificador treinado em recortes de costura.
