# Emergência Ginecológica — OSCE

Jogo de raciocínio clínico em emergência ginecológica. **Fonte única de conteúdo:** Savaris RF. *Manual de Emergência Ginecológica* (UFRGS/HCPA). Todas as condutas, pontos de corte, posologias e razões de verossimilhança citam a página do livro.

Nenhuma resposta é coletada ou armazenada: o jogo roda inteiramente no navegador.

## Fluxo de cada caso

1. Triagem → 2. Hipóteses iniciais (3, sem pontuação) → 3. Anamnese → 4. Exame físico → 5. Exames laboratoriais → 6. Exames de imagem → 7. Diagnóstico (liberado só após as etapas 3–6) → 8. Conduta → Resultado.

Os achados aparecem ao serem solicitados; a classificação de cada escolha só é revelada na tela final.

## Pontuação

| Classe | Pontos |
|---|---|
| Essencial | +10 |
| Pertinente | +5 |
| Desnecessária | −3 × multiplicador |
| Contraindicada | −10 × multiplicador |
| Diagnóstico correto | +20 |

- Multiplicador das penalidades: Nível 1 = 1×; Nível 2 = 1,5×; Nível 3 = 2×.
- Erro grave (`"grave": true`): zera a pontuação positiva da conduta e exibe o desfecho (`outcome`).
- Nível 3: cronômetro (`timerMinutes`); −2 pontos por minuto excedente (máximo −20).
- Nota = 100 × pontos obtidos / pontos máximos possíveis (limitada a 0–100).

## Níveis

| Nível | Público | Diferenças |
|---|---|---|
| 1 | Graduação | Menos distratores; condutas sem posologia |
| 2 | Residente R1–R2 | Mais distratores; posologia obrigatória |
| 3 | R3 / fellow | Cenário distinto (casos clínicos do livro), cronômetro, evolução clínica quando aplicável |

## Estrutura

```
index.html
css/style.css
js/i18n.js          textos da interface (PT/EN)
js/app.js           motor do jogo
cases/index.json    lista de casos, bloco e disponibilidade
cases/NN-*.json     um arquivo por capítulo
```

## Como editar um caso (`cases/NN-*.json`)

- `base`: triagem, sinais vitais, diagnóstico correto, explicação e aprendizado (Níveis 1–2).
- `levels."3"`: sobrescreve qualquer campo de `base` no Nível 3 (triagem, `correctDiagnosis`, `timerMinutes`, `deterioration`).
- `diagnoses`: lista usada nas hipóteses iniciais e no diagnóstico.
- `stages.anamnese | exame | lab | imagem | conduta`: itens com
  - `id`, `label {pt,en}`, `result {pt,en}` (exceto conduta), `class`, `why {pt,en}`, `ref` (página);
  - `levels: [1,2,3]` — em quais níveis o item aparece (padrão: todos);
  - `byLevel: {"3": {...}}` — muda resultado, classe ou justificativa num nível;
  - `whenFlag: {"instavel": {...}}` — muda a classe após evolução clínica;
  - `group` (conduta): `medicamento`, `procedimento`, `orientacao`, `destino`;
  - `grave: true` + `outcome {pt,en}` — erro grave.
- `deterioration` (Nível 3): `afterSeconds` e/ou `afterActions`, `vitals`, `flag`, `message`.

Para liberar um novo caso, inclua o arquivo em `cases/` e marque `"available": true` em `cases/index.json`.

## Publicação

GitHub Pages: *Settings → Pages → Deploy from a branch → main / (root)*.
