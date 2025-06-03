// --- 1. CONFIGURAÇÃO DO SHEETSDB ---
const SHEETSDB_API_BASE_URL = 'https://sheetdb.io/api/v1/ovo0p2ncfaknr';

// URLs para as abas específicas na sua planilha
const RECEITAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Receitas`;
const DESPESAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Despesas`;

// --- 2. REFERÊNCIAS DOS ELEMENTOS HTML ---
const transactionForm = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const typeInput = document.getElementById('type'); // Este é o select: 'expense' ou 'income'
const transactionsList = document.getElementById('transactions');
const totalIncomeSpan = document.getElementById('total-income');
const totalExpenseSpan = document.getElementById('total-expense');
const currentBalanceSpan = document.getElementById('current-balance');

let totalIncome = 0;
let totalExpense = 0;

// --- 3. FUNÇÕES AUXILIARES ---

// Função para formatar o valor como moeda
function formatCurrency(value) {
    // Garante que o valor é um número e formata com duas casas decimais e vírgula
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

// Função para gerar um ID único para a transação
function generateUniqueId() {
    // Combina timestamp e string aleatória para alta unicidade
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// --- 4. FUNÇÕES DE OPERAÇÃO COM SHEETSDB ---

// Função para adicionar uma transação ao SheetsDB
async function addTransactionToSheetsDB(transactionData, type) {
    // Seleciona a URL da aba correta (Receitas ou Despesas)
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    const bodyData = {};

    // Mapeia os dados do formulário para os cabeçalhos da sua planilha Google Sheets
    bodyData.descricao = transactionData.description;
    bodyData.timestamp = transactionData.timestamp;
    bodyData.id = transactionData.id;

    // Define o campo de valor específico para a aba
    if (type === 'income') {
        bodyData.valorEntrada = transactionData.amount;
    } else {
        bodyData.valorSaida = transactionData.amount;
    }

    try {
        const response = await fetch(targetUrl, {
            method: 'POST', // Usamos POST para adicionar novos dados
            headers: {
                'Content-Type': 'application/json', // Informa que o corpo da requisição é JSON
            },
            body: JSON.stringify(bodyData), // Converte o objeto JavaScript para string JSON
        });

        // Verifica se a requisição foi bem-sucedida (status 2xx)
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao adicionar: ${response.status} - ${errorText}`);
        }

        const result = await response.json(); // Converte a resposta para JSON
        console.log("Transação adicionada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição POST para SheetsDB:", error);
        alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        throw error; // Re-lança o erro para que o chamador possa tratá-lo
    }
}

// Função para deletar uma transação do SheetsDB
async function deleteTransactionFromSheetsDB(id, type) {
    // Seleciona a URL da aba correta (Receitas ou Despesas)
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    // SheetsDB permite deletar por ID adicionando '/id/SEU_ID' à URL
    const deleteUrl = `${targetUrl}/id/${id}`;

    try {
        const response = await fetch(deleteUrl, {
            method: 'DELETE', // Usamos DELETE para remover dados
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Verifica se a requisição foi bem-sucedida
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao deletar: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transação deletada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição DELETE para SheetsDB:", error);
        alert("Ocorreu um erro ao deletar a transação. Verifique o console.");
        throw error;
    }
}

// Função para buscar todas as transações de ambas as abas do SheetsDB
async function getAllTransactionsFromSheetsDB() {
    let allTransactions = [];

    try {
        // --- Busca Receitas ---
        const incomeResponse = await fetch(RECEITAS_API_URL);
        if (!incomeResponse.ok) {
            const errorText = await incomeResponse.text();
            throw new Error(`Erro ao buscar receitas: ${incomeResponse.status} - ${errorText}`);
        }
        const incomeData = await incomeResponse.json(); // Converte a resposta das receitas para JSON
        const incomes = incomeData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorEntrada), // Converte para número usando o nome da coluna da aba Receitas
            type: 'income',
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(incomes); // Adiciona as receitas à lista geral

        // --- Busca Despesas ---
        const expenseResponse = await fetch(DESPESAS_API_URL);
        if (!expenseResponse.ok) {
            const errorText = await expenseResponse.text();
            throw new Error(`Erro ao buscar despesas: ${expenseResponse.status} - ${errorText}`);
        }
        const expenseData = await expenseResponse.json(); // Converte a resposta das despesas para JSON
        const expenses = expenseData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorSaida), // Converte para número usando o nome da coluna da aba Despesas
            type: 'expense',
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(expenses); // Adiciona as despesas à lista geral

        // SheetsDB não ordena automaticamente; ordenamos no cliente por timestamp (mais recente primeiro)
        allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return allTransactions; // Retorna todas as transações combinadas e ordenadas

    } catch (error) {
        console.error("Erro ao buscar transações de SheetsDB:", error);
        alert("Ocorreu um erro ao carregar as transações. Verifique o console e a configuração do SheetsDB/Planilha.");
        return []; // Retorna um array vazio em caso de erro para evitar quebrar o app
    }
}


// --- 5. FUNÇÕES DE UI E CÁLCULOS ---

// Adiciona uma transação ao DOM (interface do usuário)
function addTransactionToDOM(transaction) {
    const listItem = document.createElement('li');
    listItem.classList.add(transaction.type); // Adiciona classe 'expense' ou 'income' para estilização
    
    const sign = transaction.type === 'expense' ? '-' : '+';
    const amountClass = transaction.type === 'expense' ? 'negative' : 'positive';

    listItem.innerHTML = `
        ${transaction.description} 
        <span class="${amountClass}">${sign} ${formatCurrency(transaction.amount)}</span>
        <button class="delete-btn" data-id="${transaction.id}" data-type="${transaction.type}">x</button>
    `;
    transactionsList.appendChild(listItem);

    // Atualiza os totais globais
    if (transaction.type === 'income') {
        totalIncome += transaction.amount;
    } else {
        totalExpense += transaction.amount;
    }
    updateSummary(); // Recalcula e exibe o resumo

    // Listener para o botão de deletar cada item individualmente
    listItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
        const transactionId = e.target.dataset.id; // Pega o ID da transação a ser deletada
        const transactionType = e.target.dataset.type; // Pega o tipo ('expense'/'income') para saber de qual aba deletar

        try {
            await deleteTransactionFromSheetsDB(transactionId, transactionType); // Chama a função de deleção do SheetsDB
            loadAllTransactions(); // Recarrega todas as transações para atualizar a UI após a deleção
        } catch (error) {
            console.error("Erro ao deletar transação no DOM:", error);
        }
    });
}

// Atualiza os valores de resumo (Receitas, Despesas, Saldo) na UI
function updateSummary() {
    const balance = totalIncome - totalExpense;
    totalIncomeSpan.textContent = formatCurrency(totalIncome);
    totalExpenseSpan.textContent = formatCurrency(totalExpense);
    currentBalanceSpan.textContent = formatCurrency(balance);
    
    // Adiciona classes CSS para estilizar o saldo (vermelho para negativo, verde para positivo)
    if (balance < 0) {
        currentBalanceSpan.classList.add('negative');
        currentBalanceSpan.classList.remove('positive');
    } else {
        currentBalanceSpan.classList.add('positive');
        currentBalanceSpan.classList.remove('negative');
    }
}

// Função principal para carregar todas as transações e exibir na UI
async function loadAllTransactions() {
    // Reseta a UI e os totais antes de carregar novos dados
    transactionsList.innerHTML = '';
    totalIncome = 0;
    totalExpense = 0;

    const allTransactions = await getAllTransactionsFromSheetsDB(); // Busca os dados do SheetsDB
    
    if (allTransactions.length === 0) {
        console.log('Nenhuma transação encontrada.');
        updateSummary(); // Atualiza o resumo mesmo que não haja transações
        return;
    }

    // Adiciona cada transação ao DOM
    allTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    // A função updateSummary já é chamada dentro de addTransactionToDOM para cada item,
    // mas chamá-la aqui novamente garante a atualização final.
    updateSummary();
}

// --- 6. EVENT LISTENERS ---

// Listener para o evento de envio do formulário de transações
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Impede o comportamento padrão do formulário (recarregar a página)

    const description = descriptionInput.value; // Pega a descrição do input
    const amount = parseFloat(amountInput.value); // Pega o valor e converte para número
    const type = typeInput.value; // Pega o tipo ('expense' ou 'income') do select

    // Valida se a descrição e o valor foram preenchidos
    if (description && amount) {
        const newTransaction = {
            description,
            amount,
            type,
            timestamp: new Date().toISOString(), // Gera um timestamp no formato ISO 8601
            id: generateUniqueId() // Gera um ID único para esta transação
        };

        try {
            // Chama a função para adicionar a transação ao SheetsDB
            await addTransactionToSheetsDB(newTransaction, type);
            console.log("Transação adicionada com sucesso no SheetsDB!");
            
            // Após adicionar, recarrega todas as transações para atualizar a UI
            loadAllTransactions();

            // Limpa o formulário para a próxima entrada
            descriptionInput.value = '';
            amountInput.value = '';
            typeInput.value = 'expense'; // Reseta o tipo para 'Despesa'
        } catch (error) {
            console.error("Erro ao adicionar transação ao SheetsDB:", error);
            alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        }
    } else {
        alert('Por favor, preencha todos os campos (descrição e valor).');
    }
});

// Listener para carregar todas as transações assim que a página é totalmente carregada
document.addEventListener('DOMContentLoaded', loadAllTransactions);