const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));

// the part is related to the DecentralizedFinance smart contract
const defi_contractAddress = "0x9F32a468055C1F3F70a848BF8F51E5e62c1aa92B";
import { defi_abi } from "./abi_decentralized_finance.js";
const defi_contract = new web3.eth.Contract(defi_abi, defi_contractAddress);

// the part is related to the the SimpleNFT smart contract
const nft_contractAddress = "0x79A9898e95C3A217a9fcd11CB312E9E59279B590";
import { nft_abi } from "./abi_nft.js";
const nft_contract = new web3.eth.Contract(nft_abi, nft_contractAddress);
//var lastEventBLock = 0;
var permissionsGiven = false;
async function connectMetaMask() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({
                method: "eth_requestAccounts",
            });
            console.log("Connected account:", accounts[0]);
            try {
                const dexSwapRate = await defi_contract.methods.dexSwapRate().call();
                getAccount();
            } catch (error) {
                console.error("Error fetching Dex Swap Rate:", error);
            }
        } catch (error) {
            console.error("Error connecting to MetaMask:", error);
        }
    } else {
        console.error("MetaMask not found. Please install the MetaMask extension.");
    }
}
var currentAccount = null;
connectMetaMask();
async function getAccount() {
    if (currentAccount == null) {
        currentAccount = await window.ethereum.request({ method: "eth_requestAccounts" }).then((accounts) => accounts[0]);
        document.getElementById("currentAccount").textContent = "Account: " + currentAccount;
    }
    return currentAccount;
}
async function setRateEthToDex() {
    const newRate = document.getElementById("newRate").value;
    try {
        const account = await getAccount();
        console.log("Account:", account);
        await defi_contract.methods.setDexSwapRate(newRate).send({ from: account });
        alert("Exchange rate set successfully!");
        document.getElementById("newRate").value = "";

    } catch (error) {
        console.error("Error setting exchange rate:", error);
    }
}

async function listenToLoanCreation() {
    const eventList = document.getElementById('eventCreationList');
    eventList.innerHTML = '';
    eventList.classList.remove('hidden');
    defi_contract.getPastEvents("loanCreated", {
        fromBlock: 0,
        toBlock: "latest",
    }, (error, events) => {
        events.forEach(event => {
            // if(event.blockNumber > lastEventBLock)
            //     lastEventBLock = event.blockNumber;
            if (event.event == "loanCreated") {
                var listItem = document.createElement('li');
                listItem.textContent = "Borrower: " + event.returnValues.borrower + " Amount: " + event.returnValues.amount + " Deadline: " + new Date(event.returnValues.deadline * 1000);
                eventList.appendChild(listItem);
                eventList.appendChild(document.createElement('br'));
            }

        });

        if (error) {
            console.error("Error fetching events:", error);
        } else {
            console.log("Events:", events);
        }
    });
}

async function checkLoanStatus() {
    //TODO
    const id = document.getElementById("numberLoanStatusId").value;
    document.getElementById("loanStatusDisplay").textContent = "";
    const account = await getAccount();
    try {
        const loan = await defi_contract.methods.loans(id).call({ from: account });
        if (loan.borrower == "0x0000000000000000000000000000000000000000") {
            alert("Loan not found");
            return;
        }

        const loanObject = { loanId: id, borrower: loan.borrower, lender: loan.lender, amount: loan.amountEth, deadline: new Date(loan.deadline * 1000), isBasedNft: loan.isBasedNft, nftId: loan.nftId };
        console.log(loanObject);
        document.getElementById("loanStatusDisplay").textContent =
            "Loan ID: " + loanObject.loanId + "\n" +
            "Borrower: " + loanObject.borrower + "\n" +
            "Lender: " + loanObject.lender + "\n" +
            "Amount: " + loanObject.amount + "\n" +
            "Deadline: " + loanObject.deadline + "\n" +
            "Is Based NFT: " + loanObject.isBasedNft + "\n" +
            "NFT ID: " + loanObject.nftId;
        document.getElementById("loanStatusDisplay").classList.remove("hidden");
    } catch (error) {
        console.error("Error fetching loan:", error);
    }
}

async function buyDex() {
    const account = await getAccount();
    const amount = document.getElementById("ethAmount").value;
    try {
        await defi_contract.methods.buyDex().send({ from: account, value: amount });
        alert("Dex bought successfully!");
        document.getElementById("ethAmount").value = "";
    }
    catch (error) {
        console.error("Error buying Dex:", error);
    }
}

async function getDex() {
    try {
        const account = await getAccount();
        const dexBalance = await defi_contract.methods.getDexBalance().call({ from: account });

        // Display the Dex balance in a div
        document.getElementById("dexBalanceDisplay").textContent = "Dex Balance: " + dexBalance;
        document.getElementById("dexBalanceDisplay").classList.remove("hidden");
    } catch (error) {
        console.error("Error fetching Dex balance:", error);
    }
}

async function sellDex() {
    const account = await getAccount();
    const amount = document.getElementById("dexAmount").value;
    try {
        await defi_contract.methods.sellDex(amount).send({ from: account });
        alert("Dex sold successfully!");
        document.getElementById("dexAmount").value = "";
    }
    catch (error) {
        console.error("Error selling Dex:", error);
    }
}

async function loan() {
    var loanAmount = document.getElementById("loanAmount").value;
    var deadline = new Date(document.getElementById("deadline").value).getTime() / 1000; // Convert to Unix timestamp
    console.log("Deadline:", deadline);
    console.log("Loan Amount:", loanAmount);
    try {
        const account = await getAccount();
        console.log("Account:", account);
        const gasEstimate = await defi_contract.methods.loan(loanAmount, deadline).estimateGas({ from: account });
        const encode = await defi_contract.methods.loan(loanAmount, deadline).encodeABI();
        const tx = await web3.eth.sendTransaction({
            from: account,
            to: defi_contractAddress,
            gas: gasEstimate,
            data: encode,
        });
        alert("Loan request sent successfully!");
        document.getElementById("loanAmount").value = "";
        document.getElementById("deadline").value = "";
    } catch (error) {
        console.error("Error sending loan request:", error);
    }
}

async function returnLoan() {
    const loanId = document.getElementById("loanId").value;
    const amount = document.getElementById("returnEthAmount").value;
    try {
        const account = await getAccount();
        const gasEstimate = await defi_contract.methods.returnLoan(loanId).estimateGas({ from: account, value: amount });
        const encode = await defi_contract.methods.returnLoan(loanId).encodeABI();
        const tx = await web3.eth.sendTransaction({
            from: account,
            to: defi_contractAddress,
            gas: gasEstimate,
            data: encode,
            value: amount,
        });
        alert("Loan returned successfully!");
        document.getElementById("loanId").value = "";
        document.getElementById("returnEthAmount").value = "";
    }
    catch (error) {
        console.error("Error returning loan:", error);
        alert(error.message)
    }
}

async function getEthTotalBalance() {
    try {
        const account = await getAccount();
        const ethBalance = await defi_contract.methods.getBalance().call({ from: account });


        // Display the Dex balance in a div
        document.getElementById("ethBalanceDisplay").textContent = "Contract Wei Balance: " + ethBalance;
        document.getElementById("ethBalanceDisplay").classList.remove("hidden");
    } catch (error) {
        console.error("Error fetching Dex balance:", error);
    }
}

async function getRateEthToDex() {
    try {
        const account = await getAccount();
        const ethBalance = await defi_contract.methods.dexSwapRate().call({ from: account });

        // Display the Dex balance in a div
        document.getElementById("rateDisplay").textContent = "1 Dex Token costs " + ethBalance + " Wei";
        document.getElementById("rateDisplay").classList.remove("hidden");
    } catch (error) {
        console.error("Error fetching Dex balance:", error);
    }
}

async function getAvailableNfts() {
    try {
        const account = await getAccount();
        const amountLoans = await defi_contract.methods.getLoanNumber().call({ from: account });
        const nftList = document.getElementById('nftList');
        nftList.innerHTML = ''; // Clear any existing NFTs
        nftList.classList.remove('hidden');

        for (let i = 0; i < amountLoans; i++) {
            const loan = await defi_contract.methods.loans(i).call({ from: account });
            console.log(loan)
            if (loan.isBasedNft && loan.lender == "0x0000000000000000000000000000000000000000") {
                const li = document.createElement('li');
                var uri = await nft_contract.methods.tokenURI(loan.nftId).call();
                var img = null;
                try {
                    uri = uri.replace("\"", "");
                    const response = await fetch(uri);
                    const imageBlob = await response.blob();

                    const objectURL = URL.createObjectURL(imageBlob);
                    img = document.createElement("img");
                    img.src = objectURL;
                    img.width = 150;
                    img.height = 150;
                } catch (error) {
                    img = document.createElement('img')
                    img.src = "https://media.istockphoto.com/id/1055079680/vector/black-linear-photo-camera-like-no-image-available.jpg?s=612x612&w=0&k=20&c=P1DebpeMIAtXj_ZbVsKVvg-duuL0v9DlrOZUvPG6UJk="
                    img.width = 150;
                    img.height = 150;
                }
                const ethAmount = loan.amountEth;

                // Create ETH amount element
                const ethElement = document.createElement('p');
                ethElement.textContent = `Price: ${ethAmount} Wei ID: ${loan.nftId} Deadline: ${new Date(loan.deadline * 1000)}`;

                // Append image and ETH amount to list item
                li.appendChild(img);
                li.appendChild(ethElement);

                // Append list item to nftList
                nftList.appendChild(li);
            }
        }
    } catch (error) {
        console.error("Error fetching available NFTs:", error);
    }
}

async function getTotalBorrowedAndNotPaidBackEth() {
    try {
        const account = await getAccount();
        const borrowedEth = await defi_contract.methods.borrowedNotPayedBack().call({ from: account });

        // Display the Dex balance in a div
        document.getElementById("borrowedEthDisplay").textContent = "Total borrowed and not paid back: " + borrowedEth + " Wei";
        document.getElementById("borrowedEthDisplay").classList.remove("hidden");
    } catch (error) {
        console.error("Error fetching borrowed and not paid back:", error);
    }
}

async function makeLoanRequestByNft() {
    const account = await getAccount();

    if (!permissionsGiven) {
        try {
            await nft_contract.methods.setApprovalForAll(defi_contractAddress, true).send({ from: account });
            permissionsGiven = true;
        }
        catch (error) {
            console.error("Error giving permissions:", error);
        }
        return;
    }
    var loanAmount = document.getElementById("nftLoanAmount").value;
    var deadline = new Date(document.getElementById("nftDeadline").value).getTime() / 1000; // Convert to Unix timestamp
    var nftId = document.getElementById("nftId").value;
    var nftAdress = nft_contractAddress;
    try {
        console.log("Account:", account);
        const gasEstimate = await defi_contract.methods.makeLoanRequestByNft(nftAdress, nftId, loanAmount, deadline).estimateGas({ from: account });
        const encode = await defi_contract.methods.makeLoanRequestByNft(nftAdress, nftId, loanAmount, deadline).encodeABI();
        const tx = await web3.eth.sendTransaction({
            from: account,
            to: defi_contractAddress,
            gas: gasEstimate,
            data: encode,
        });
        alert("Loan request sent successfully!");
        document.getElementById("nftLoanAmount").value = "";
        document.getElementById("nftDeadline").value = "";
        document.getElementById("nftId").value = "";
    } catch (error) {
        console.error("Error sending loan request:", error);
    }
}

async function cancelLoanRequestByNft() {
    const account = await getAccount();
    const id = document.getElementById("cancelNftId").value;
    try {
        const gasEstimate = await defi_contract.methods.cancelLoanRequestByNft(nft_contractAddress, id).estimateGas({ from: account });
        const encode = await defi_contract.methods.cancelLoanRequestByNft(nft_contractAddress, id).encodeABI();
        const tx = await web3.eth.sendTransaction({
            from: account,
            to: defi_contractAddress,
            gas: gasEstimate,
            data: encode,
        });
        alert("Loan request canceled successfully!");
        document.getElementById("cancelNftId").value = "";
    } catch (error) {
        console.error("Error canceling loan request:", error);
    }
}

async function loanByNft() {
    const nftId = document.getElementById("lendNftId").value;

    try {
        const account = await getAccount();
        const gasEstimate = await defi_contract.methods.loanByNft(nft_contractAddress, nftId).estimateGas({ from: account });
        const encode = await defi_contract.methods.loanByNft(nft_contractAddress, nftId).encodeABI();
        const tx = await web3.eth.sendTransaction({
            from: account,
            to: defi_contractAddress,
            gas: gasEstimate,
            data: encode,
        });
        alert("Loan taken successfully!");
        document.getElementById("lendNftId").value = "";
    } catch (error) {
        console.error("Error sending loan request:", error);
    }
}

async function checkLoan() {
    //todo
    const account = await getAccount();
    const loanCounter = await defi_contract.methods.getLoanNumber().call({ from: account });
    for(let i = 0; i < loanCounter; i++) {
        const loan = await defi_contract.methods.loans(i).call({ from: account });
        if(loan.borrower == "0x0000000000000000000000000000000000000000"){
            continue;
        }
        if(loan.isBasedNft){


            try{
                console.log("Loan",loan)
                console.log("Checking loan:", i);
                const gasEstimate = await defi_contract.methods.checkLoan(i).estimateGas({ from: account });
                const nonce = await web3.eth.getTransactionCount(account);
                const encode = await defi_contract.methods.checkLoan(i).encodeABI();
                const tx = await defi_contract.methods.checkLoan(i).send({
                    from: account,
                    gas: gasEstimate, // specify the gas limit
                    to: defi_contractAddress,
                    data: encode,
                });
                
                
                alert("Loan checked successfully!");
            }catch(error){
                console.error("Loan still valid:", error);
            }
        }
    }
}
(async function runCheckLoan() {
    await checkLoan(); // Run the function immediately

    setInterval(async () => {
        await checkLoan();
    }, 20000); // 60000 milliseconds = 1 minute
})();

async function getAllTokenURIs() {
    const totalTokens = await nft_contract.methods.tokenIdCounter().call();
    const tokenURIs = [];
    const tokenUriList = document.getElementById('tokenUriList');
    console.log("Total Tokens:", totalTokens);
    try {
        for (let tokenId = 1; tokenId <= totalTokens; tokenId++) {
            const tokenURI = await nft_contract.methods.tokenURI(tokenId).call();
            console.log("Token URI:", tokenURI);
            const owner = await nft_contract.methods.ownerOf(tokenId).call();
            const account = await getAccount();
            console.log("Owner:", owner, "URI");
            
            if (owner.toLowerCase() === account.toLowerCase()) {
                tokenURIs.push(tokenURI + "     Token ID: " + tokenId);
                console.log("EQUALS");
            }
        }

        // Clear the list and make it visible
        tokenUriList.innerHTML = '';
        tokenUriList.classList.remove('hidden');

        // Append each URI as a list item
        tokenURIs.forEach(uri => {
            const listItem = document.createElement('li');
            listItem.textContent = uri;
            tokenUriList.appendChild(listItem);
        });

        console.log("All token URIs:", tokenURIs);
    } catch (error) {
        console.error("Error fetching token URIs:", error);
    }
}



async function mintNFT() {
    const account = await getAccount();
    var URI = document.getElementById("tokenURI").value;
    try {
        URI = "\"" + URI + "\"";
        const gasEstimate = await nft_contract.methods.mint(URI).estimateGas({ from: account });
        const encode = await nft_contract.methods.mint(URI).encodeABI();
        const tx = await web3.eth.sendTransaction({
            from: account,
            to: nft_contractAddress,
            gas: gasEstimate,
            data: encode,
        });
        alert("NFT minted successfully!");
        document.getElementById("tokenURI").value = "";
    } catch (error) {
        console.error("Error minting NFT:", error);
    }
}
window.mintNFT = mintNFT;
window.connectMetaMask = connectMetaMask;
window.buyDex = buyDex;
window.getDex = getDex;
window.sellDex = sellDex;
window.loan = loan;
window.returnLoan = returnLoan;
window.getEthTotalBalance = getEthTotalBalance;
window.setRateEthToDex = setRateEthToDex;
window.getRateEthToDex = getRateEthToDex;
window.makeLoanRequestByNft = makeLoanRequestByNft;
window.cancelLoanRequestByNft = cancelLoanRequestByNft;
window.loanByNft = loanByNft;
window.checkLoan = checkLoan;
window.listenToLoanCreation = listenToLoanCreation;
window.getAvailableNfts = getAvailableNfts;
window.getTotalBorrowedAndNotPaidBackEth = getTotalBorrowedAndNotPaidBackEth;
window.checkLoanStatus = checkLoanStatus;
window.getAllTokenURIs = getAllTokenURIs;