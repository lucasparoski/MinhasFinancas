// --- 1. CONFIGURAÇÃO DO SHEETSDB ---
const SHEETSDB_API_BASE_URL = 'https://sheetdb.io/api/v1/ovo0p2ncfaknr';

// URLs para as abas específicas na sua planilha
const RECEITAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Receitas`;
const DESPESAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Despesas`;

// --- 2. REFERÊNCIAS DOS ELEMENTOS HTML ---
const transactionForm = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const monthSelectAdd = document.getElementById('month-select-add'); // Novo seletor de mês para ADIÇÃO
const typeInput = document.getElementById('type'); // Este é o select: 'expense' ou 'income'
const transactionsList = document.getElementById('transactions');
const totalIncomeSpan = document.getElementById('total-income');
const totalExpenseSpan = document.getElementById('total-expense');
const currentBalanceSpan = document.getElementById('current-balance');

// NÃO PRECISAMOS DE monthSelect ou allLoadedTransactions, pois não há filtro/carregamento por mês
// let allLoadedTransactions = []; 

let totalIncome = 0;
let totalExpense = 0;

// --- 3. FUNÇÕES AUXILIARES ---

// Função para formatar o valor como moeda
function formatCurrency(value) {
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

// Função para gerar um ID único para a transação
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Função para adicionar uma transação ao SheetsDB
async function addTransactionToSheetsDB(transactionData, type) {
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    const bodyData = {};

    bodyData.descricao = transactionData.description;
    bodyData.timestamp = transactionData.timestamp;
    bodyData.id = transactionData.id;
    bodyData.mesReferencia = transactionData.mesReferencia; // Adiciona a coluna 'mesReferencia'

    if (type === 'income') {
        bodyData.valorEntrada = transactionData.amount;
    } else {
        bodyData.valorSaida = transactionData.amount;
    }

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao adicionar: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transação adicionada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição POST para SheetsDB:", error);
        alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        throw error;
    }
}

// Função para deletar uma transação do SheetsDB
async function deleteTransactionFromSheetsDB(id, type) {
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    const deleteUrl = `${targetUrl}/id/${id}`;

    try {
        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

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

// Função para buscar TODAS as transações do SheetsDB (sem filtro)
async function getAllTransactionsFromSheetsDB() {
    let allTransactions = [];

    try {
        // Busca Receitas
        const incomeResponse = await fetch(RECEITAS_API_URL);
        if (!incomeResponse.ok) {
            const errorText = await incomeResponse.text();
            throw new Error(`Erro ao buscar receitas: ${incomeResponse.status} - ${errorText}`);
        }
        const incomeData = await incomeResponse.json();
        const incomes = incomeData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorEntrada),
            type: 'income',
            mesReferencia: item.mesReferencia, // Pega o mesReferencia
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(incomes);

        // Busca Despesas
        const expenseResponse = await fetch(DESPESAS_API_URL);
        if (!expenseResponse.ok) {
            const errorText = await expenseResponse.text();
            throw new Error(`Erro ao buscar despesas: ${expenseResponse.status} - ${errorText}`);
        }
        const expenseData = await expenseResponse.json();
        const expenses = expenseData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorSaida),
            type: 'expense',
            mesReferencia: item.mesReferencia, // Pega o mesReferencia
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(expenses);

        // SheetsDB não ordena, então ordenamos no cliente por timestamp (mais recentes primeiro)
        allTransactions.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        return allTransactions;

    } catch (error) {
        console.error("Erro ao buscar transações:", error);
        alert("Ocorreu um erro ao carregar as transações. Verifique o console e a configuração do SheetsDB/Planilha.");
        return [];
    }
}


// --- 4. FUNÇÕES DE UI E CÁLCULOS ---

function addTransactionToDOM(transaction) {
    const listItem = document.createElement('li');
    listItem.classList.add(transaction.type);
    
    const sign = transaction.type === 'expense' ? '-' : '+';
    const amountClass = transaction.type === 'expense' ? 'negative' : 'positive';

    // Inclui o mês de referência na exibição
    listItem.innerHTML = `
        <span>${transaction.description} (${transaction.mesReferencia})</span> 
        <span class="${amountClass}">${sign} ${formatCurrency(transaction.amount)}</span>
        <button class="delete-btn" data-id="${transaction.id}" data-type="${transaction.type}">x</button>
    `;
    transactionsList.appendChild(listItem);

    // Atualiza os totais
    if (transaction.type === 'income') {
        totalIncome += transaction.amount;
    } else {
        totalExpense += transaction.amount;
    }
    updateSummary();

    // Adiciona listener para o botão de deletar no DOM
    listItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
        const transactionId = e.target.dataset.id;
        const transactionType = e.target.dataset.type;

        try {
            await deleteTransactionFromSheetsDB(transactionId, transactionType);
            loadAllTransactions(); // Recarrega todas as transações
        } catch (error) {
            console.error("Erro ao deletar transação no DOM:", error);
        }
    });
}

function updateSummary() {
    const balance = totalIncome - totalExpense;
    totalIncomeSpan.textContent = formatCurrency(totalIncome);
    totalExpenseSpan.textContent = formatCurrency(totalExpense);
    currentBalanceSpan.textContent = formatCurrency(balance);
    
    if (balance < 0) {
        currentBalanceSpan.classList.add('negative');
        currentBalanceSpan.classList.remove('positive');
    } else {
        currentBalanceSpan.classList.add('positive');
        currentBalanceSpan.classList.remove('negative');
    }
}

// Função para carregar TODAS as transações e exibir
async function loadAllTransactions() {
    transactionsList.innerHTML = ''; // Limpa a lista
    totalIncome = 0; // Zera os totais
    totalExpense = 0;

    const allTransactions = await getAllTransactionsFromSheetsDB(); // Carrega TUDO
    
    if (allTransactions.length === 0) {
        console.log('Nenhuma transação encontrada.');
        updateSummary();
        return;
    }

    // Adiciona todas as transações ao DOM
    allTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    updateSummary(); 
}

// --- 5. EVENT LISTENERS ---

// Listener para o evento de envio do formulário de transações
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const description = descriptionInput.value;
    const amount = parseFloat(amountInput.value);
    const mesReferencia = monthSelectAdd.value; // Pega o valor do seletor de mês
    const type = typeInput.value; 

    if (description && amount && mesReferencia) {
        const newTransaction = {
            description,
            amount,
            type,
            mesReferencia, 
            timestamp: new Date().toISOString(), 
            id: generateUniqueId() 
        };

        try {
            await addTransactionToSheetsDB(newTransaction, type);
            console.log("Transação adicionada com sucesso no SheetsDB!");
            
            // Recarrega todas as transações para atualizar a UI
            loadAllTransactions(); 

            // Limpa o formulário para a próxima entrada
            descriptionInput.value = '';
            amountInput.value = '';
            monthSelectAdd.value = ''; // Limpa/reseta o seletor de mês
            typeInput.value = 'expense'; 
        } catch (error) {
            console.error("Erro ao adicionar transação ao SheetsDB:", error);
            alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        }
    } else {
        alert('Por favor, preencha todos os campos (descrição, valor e mês).');
    }
});

// Carregar todas as transações ao iniciar a página
document.addEventListener('DOMContentLoaded', loadAllTransactions);