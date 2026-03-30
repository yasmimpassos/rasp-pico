# Projeto de Telemetria: Raspberry Pi Pico W + Backend Assíncrono

Este repositório contém o firmware desenvolvido para o **Raspberry Pi Pico W**, responsável por gerar dados de sensores e transmiti-los via HTTP para um backend distribuído.

### Links Rápidos
* **Vídeo da solução em funcionamento:** [Clique aqui para assistir](https://drive.google.com/file/d/1wd4J1N3d_a2UUsSsv1Ik4jqv5GoydYwN/view?usp=sharing)
* **Repositório do Backend (Atividade 1):** [Acesse o repositório aqui](https://github.com/yasmimpassos/back-infra)
* **Testes de carga:** Foram adicionados testes de carga da "primeira ponderada" (scripts em `loadtest/`).


## 1. Arquitetura do Sistema
A solução foi desenhada para garantir que o dispositivo de borda (Edge) não dependa de uma conexão constante para continuar operando. O fluxo de dados é:

**Pico W (Firmware) → HTTP POST (Túnel ngrok) → API (Go) → Fila RabbitMQ → Consumer → Banco PostgreSQL.**


## 2. Gerenciamento de Dados e Estratégia de Mock
Para validar a integração sem a necessidade de componentes eletrônicos externos em todos os testes, o firmware utiliza **sensores mockados**. 

* **Lógica de Mock:** O código utiliza a função `random()` do C++ para gerar valores realistas dentro dos ranges esperados.
* **Fila Local (Resiliência):** Implementamos uma `std::queue` que armazena até 20 leituras. Se o Wi-Fi cair ou o backend demorar a responder, o Pico W guarda os dados e os envia em lote assim que a conexão estabiliza.
* **Timestamp na Borda:** O dispositivo utiliza **NTP** para buscar a hora real. Isso garante que o dado mockado tenha o horário exato de sua "geração", e não o horário de chegada ao servidor.

## 3. Hardware e Sensores (Simulados via Software)
| Componente | Tipo | Pino (Referência) | Range do Mock | Finalidade |
| :--- | :--- | :--- | :--- | :--- |
| **Potenciômetro** | Analógico | `GP26` | `0.0` a `100.0` | Simular nível ou intensidade (%) |
| **Botão** | Digital | `GP15` | `0` ou `1` | Simular eventos discretos |

## 4. Comunicação e Exposição (ngrok)
Como o backend roda em `localhost` e o Pico W está na rede externa, utilizamos o **ngrok** para criar um túnel público.

### Como rodar o ngrok:
1.  Instale o ngrok no seu Linux.
2.  Com o backend Docker rodando na porta 8080, execute no terminal:
    ```bash
    ngrok http 8080
    ```
3.  O terminal exibirá uma URL como `https://abcd-123.ngrok-free.dev`.
4.  **Atenção:** Copie essa URL e cole na variável `serverUrl` no código do Arduino antes de compilar.

## 5. Configuração e Compilação
### 5.1 Configuração de Rede
No arquivo `.ino`, você **deve** atualizar estas linhas para o seu ambiente:
```cpp
const char* ssid = "NOME_DO_SEU_WIFI";
const char* password = "SENHA_DO_SEU_WIFI";
const char* serverUrl = "https://SUA_URL_DO_NGROK/telemetry";
```

### 5.2 Toolchain e Gravação
1.  **Framework:** Arduino Core para RP2040 (Earle Philhower).
2.  **Biblioteca:** `ArduinoJson` (v7.x).
3.  **Gravação:** Conecte o Pico W segurando o botão **BOOTSEL**. Selecione a porta e a placa no Arduino IDE e clique em **Upload**.

## 6. Evidências de Funcionamento
### Logs do Serial Monitor
O log demonstra a Máquina de Estados (FSM) em funcionamento, gerando os dados mockados e enviando via POST:
```bash
--- Sistema de Monitoramento Iniciado ---
[WIFI] Conectado!
[FILA] Dados de Potenciometro adicionados. Total de dados na fila: 1
[FILA] Dados de Botao adicionados. Total de dados na fila: 2
[HTTP] Enviando POST: {"device_id":101,"timestamp":"1970-01-01T00:00:09Z","sensor":{"type":"Potenciometro","unit":"%"},"reading":{"value_type":"analog","value":93.3}}
[HTTP] Status: 200
[HTTP] Telemetria entregue com sucesso.
[HTTP] Enviando POST: {"device_id":101,"timestamp":"2026-03-29T23:27:11Z","sensor":{"type":"Botao","unit":"bin"},"reading":{"value_type":"discrete","value":1}}
[HTTP] Status: 200
[HTTP] Telemetria entregue com sucesso.
[FILA] Dados de Potenciometro adicionados. Total de dados na fila: 1
[FILA] Dados de Botao adicionados. Total de dados na fila: 2
[HTTP] Enviando POST: {"device_id":101,"timestamp":"2026-03-29T23:27:15Z","sensor":{"type":"Potenciometro","unit":"%"},"reading":{"value_type":"analog","value":26.2}}
[HTTP] Status: 200
```

### Validação no Backend
Para confirmar que os dados cruzaram o túnel e chegaram ao banco:
```bash
backend   | [GIN] 2026/03/29 - 23:47:22 | 200 |   8.78ms |  179.209.46.196 | POST     "/telemetry"
consumer  | 2026/03/29 23:47:22 Mensagem recebida: {"device_id":101,"timestamp":"2026-03-29T23:47:21Z","sensor":{"type":"Potenciometro","unit":"%"},"reading":{"value_type":"analog","value":43.5}}
consumer  | 2026/03/29 23:47:22 Dados salvos no banco
backend   | [GIN] 2026/03/29 - 23:47:22 | 200 |  15.43ms |  179.209.46.196 | POST     "/telemetry"
consumer  | 2026/03/29 23:47:23 Mensagem recebida: {"device_id":101,"timestamp":"2026-03-29T23:47:22Z","sensor":{"type":"Botao","unit":"bin"},"reading":{"value_type":"discrete","value":0}}
consumer  | 2026/03/29 23:47:23 Dados salvos no banco
```