// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract DecentralizedFinance is ERC20, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _loanCounter;
    struct Loan {
        uint256 deadline; // determines the deadline of a loan.
        uint256 amountEth; // determines the amount of a loan in ETH.
        address lender; // determines the address of the lender of a loan (the lender could be thissmart contract or another user)
        address borrower; // that determines the address of the borrower.
        bool isBasedNft; // this variable is true if an NFT is used as collateral; otherwise, it is false.
        address nftContract; //in case isBasedNft is true, this variable stores the contract managing the NFT presented as collateral.
        uint256 nftId;
    }
    uint256 public constant initialSupply = 10e30; //currency will be represented in wei and Dei a smaller unit of DEX
    uint256 public maxLoanDuration;
    uint256 public dexSwapRate; //the swap rate of one DEX in Wei, i.e., how many Wei a DEX costs
    uint256 public loanCounter;
    uint256 public borrowedNotPayedBack;
    mapping(uint256 => Loan) public loans;

    event loanCreated(
        address indexed borrower,
        uint256 amount,
        uint256 deadline
    );

    constructor() ERC20("DEX", "DEX") Ownable(msg.sender) {
        _mint(address(this), 10**18 * 1 ether);
        maxLoanDuration = 365 days;
        dexSwapRate = 1 ether;
    }

    function convertWeiToDei(uint256 _ethAmount)
        internal
        view
        returns (uint256)
    {
        return (1 ether * _ethAmount) / dexSwapRate; // 10^18 DEI * wei(msg)  / swap rate, regra 3 simples
    }

    function convertDeiToWei(uint256 _deiAmount)
        internal
        view
        returns (uint256)
    {
        return (dexSwapRate * _deiAmount) / 1 ether;
    }

    function buyDex() external payable {
        require(msg.value > 0, "Must send ETH to buy DEX tokens");
        uint256 deiAmount = convertWeiToDei(msg.value); // 10^18 DEI * wei(msg)  / swap rate, regra 3 simples
        require(deiAmount > 0, "Insufficient ETH sent for any DEX tokens");
        _transfer(address(this), msg.sender, deiAmount); // Transfer DEX tokens from contract to buyer
        dexSwapRate = dexSwapRate + msg.value / 100; // increase by 1 percent the rate
        //Note: i assumed to work in wei to represent eth value and _transfer already make all validations for me
    }

    function sellDex(uint256 _deiAmount) external {
        require(
            _deiAmount > 0,
            "Amount of DEX tokens to sell must be greater than zero"
        );
        uint256 ethAmount = convertDeiToWei(_deiAmount);
        require(
            address(this).balance >= ethAmount,
            "Contract does not have enough ETH"
        );
        //transfer dexTokens to the contract address
        _transfer(msg.sender, address(this), _deiAmount); //already validates if sender as DexAmount
        //tranfer eth back to the seller given the exchange rage;
        payable(msg.sender).transfer(ethAmount);
    }

    function loan(uint256 _dexAmount, uint256 _deadline) external {
        require(
            _deadline <= block.timestamp + maxLoanDuration &&
                _deadline > block.timestamp,
            "Invalid deadline"
        ); // the loan starts when the block is created
        require(
            _dexAmount > 0,
            "Amount of DEX tokens collateral must be greater than zero"
        );

        require(
            balanceOf(msg.sender) >= _dexAmount,
            "You cannot collateral more DEX then you have available"
        );

        uint256 initialEthValue = convertDeiToWei(_dexAmount) / 2;
        uint256 ethValue = calculateInitialEthValue(_dexAmount, _deadline); // DONT FORGET DIVIDE TO HALF
        //Ideia: pegar neste initial value e transferir, mas antes disso pegar no pedido e dividir por dois e esse fica guardado na loan
        //este initial e o que e transferido em si.

        // Solucao final: Colateralizo metade do dex, mas empresto apenas metade(menos a taxa de juro)
        // e caso o borrower pague tudo ele apenas recebera o proporcional desse valor obtido inicialmente
        // entao o lender vai sempre ficar com o excedente ou seja taxa de juro
        // EX: initialEthValue = 0.5 (Guardo como colateral) e transfiro 0.5-taxa de juro = 0.45(exemplo)
        // em eth para o borrower, ou seja, o lender fica com o equivalente a 0.5 dex mas o borrower podera apenas
        // devolver 0.45 e o seu proporcional restando 0.05 de Juro em Dex Tokens para o lender.
        // por outras palavras o juro obtemse atraves de um colateral maior, pago em Dex Tokens

        require(
            address(this).balance >= ethValue,
            "Contract does not have enough ETH"
        );

        uint256 collateralizedDexAmount = convertWeiToDei(initialEthValue);

        _transfer(msg.sender, address(this), collateralizedDexAmount); // verifies if sender has dex internally
        payable(msg.sender).transfer(ethValue);
        dexSwapRate = dexSwapRate - ethValue / 100;

        borrowedNotPayedBack += ethValue;

        uint256 loanId = _loanCounter.current();
        loans[loanId] = loans[loanCounter] = Loan({
            deadline: _deadline,
            amountEth: ethValue,
            lender: address(this),
            borrower: msg.sender,
            isBasedNft: false,
            nftContract: address(0),
            nftId: 0
        });
        _loanCounter.increment();
        emit loanCreated(msg.sender, ethValue, _deadline);
    }

    function calculateInitialEthValue(uint256 dexAmount, uint256 deadline)
        internal
        view
        returns (uint256)
    {
        // Example formula:
        // Initial loan value decreases linearly with the increase in deadline
        // and increases linearly with the dexAmount

        //the longer the payback deadline, the lower the value of ETH per DEX
        uint256 monthsRemaining = (deadline - block.timestamp) / 30 days;
        uint256 initialEthValue = convertDeiToWei(dexAmount) / 2;
        //Increment the initial value by 1 percent depending on the amount of months remainins
        // parameters such as time and interest rate can be changed
        initialEthValue =
            initialEthValue -
            ((initialEthValue * monthsRemaining * 1) / 100);
        return initialEthValue;
    }

    function returnLoan(uint256 loanId) external payable {
        Loan storage _loan = loans[loanId];
        require(
            _loan.borrower == msg.sender,
            "The requesting address is not the loan borrower."
        );
        require(_loan.amountEth > 0, "This loan has already been paid.");
        require(
            block.timestamp <= _loan.deadline,
            "Deadline expired the lender lost all the collateral."
        );
        require(
            msg.value > 0,
            "The message value should be greater then 0 Wei."
        );
        if (!_loan.isBasedNft) {
            uint256 remainingEthBorrowed = _loan.amountEth;
            uint256 exceedingAmount = msg.value > remainingEthBorrowed
                ? msg.value - remainingEthBorrowed
                : 0;

            if (exceedingAmount > 0) {
                payable(msg.sender).transfer(exceedingAmount);
            }

            uint256 deductValue = exceedingAmount > 0
                ? remainingEthBorrowed
                : msg.value;

            borrowedNotPayedBack -= deductValue;
            dexSwapRate = dexSwapRate + deductValue / 100;
            uint256 dexReturned = convertDeiToWei(deductValue);
            _transfer(address(this), msg.sender, dexReturned);
            _loan.amountEth -= deductValue;
        } else {
            require(
                msg.value == _loan.amountEth,
                "You must pay the exact value in NFT based contracts"
            );
            //ASK IF PARTIAL PAYMENTS MUST BE ACCEPTED IN NFT BASED LOANS
            borrowedNotPayedBack -= msg.value;
            IERC721(_loan.nftContract).transferFrom(
                address(this),
                _loan.borrower,
                _loan.nftId
            );
            _transfer(
                address(this),
                _loan.lender,
                convertWeiToDei(_loan.amountEth)
            );
            _loan.amountEth = 0;
            dexSwapRate = dexSwapRate + msg.value / 100;
            delete loans[loanId];
        }
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function setDexSwapRate(uint256 rate) external onlyOwner {
        dexSwapRate = rate;
    }

    function getDexBalance() public view returns (uint256) {
        //This is already implemented By ERC20
        return balanceOf(msg.sender);
    }

    function makeLoanRequestByNft(
        IERC721 nftContract,
        uint256 nftId,
        uint256 loanAmount,
        uint256 deadline
    ) external {
        require(
            deadline <= block.timestamp + maxLoanDuration &&
                deadline > block.timestamp,
            "Invalid deadline"
        );
        require(loanAmount > 0, "Loan amount must be greater than zero");
        //require(!nftLoanExists,"This NFT is already being used as collateral");
        // Ensure the contract is approved to transfer the NFT
        require(
            nftContract.getApproved(nftId) == address(this) ||
                nftContract.isApprovedForAll(msg.sender, address(this)),
            "Contract is not approved to transfer this NFT"
        );

        nftContract.transferFrom(msg.sender, address(this), nftId); // Transfer NFT to the contract

        uint256 loanId = _loanCounter.current();
        loans[loanId] = Loan({
            deadline: deadline,
            amountEth: loanAmount,
            lender: address(0),
            borrower: msg.sender,
            isBasedNft: true,
            nftContract: address(nftContract),
            nftId: nftId
        });
        _loanCounter.increment();
        emit loanCreated(msg.sender, loanAmount, deadline);
    }

    function cancelLoanRequestByNft(IERC721 nftContract, uint256 nftId)
        external
    {
        uint256 loanId = _findLoanIdByNft(nftContract, nftId);
        Loan storage _loan = loans[loanId];
        require(
            _loan.borrower == msg.sender,
            "Only the borrower can cancel the loan request"
        );
        require(
            _loan.lender == address(0),
            "Cannot cancel a loan that has already been lent"
        );

        nftContract.transferFrom(address(this), msg.sender, nftId); // Transfer NFT back to the borrower
        delete loans[loanId];
    }

    function loanByNft(IERC721 nftContract, uint256 nftId) external {
        uint256 loanId = _findLoanIdByNft(nftContract, nftId);
        Loan storage _loan = loans[loanId];
        require(_loan.lender == address(0), "This loan already has a lender");
        require(
            _loan.deadline > block.timestamp,
            "The loan deadline has passed."
        );
        uint256 requiredDei = convertWeiToDei(_loan.amountEth);
        require(
            requiredDei <= balanceOf(msg.sender),
            "You do not have enough Dex to stake NFT loan"
        );
        require(
            address(this).balance >= _loan.amountEth,
            "The contract does not have enough ETH for loan"
        );
        _loan.lender = msg.sender;
        _transfer(msg.sender, address(this), requiredDei);

        payable(_loan.borrower).transfer(_loan.amountEth);
        dexSwapRate = dexSwapRate - _loan.amountEth / 100;

        borrowedNotPayedBack += _loan.amountEth;
        emit loanCreated(_loan.borrower, _loan.amountEth, _loan.deadline);
    }

    function checkLoan(uint256 loanId) external onlyOwner {
        Loan storage _loan = loans[loanId];
        require(
            block.timestamp > _loan.deadline,
            "Loan deadline has not passed yet"
        );
        require(
            _loan.isBasedNft,
            "Check only for NFT loans, the check for DEX collateral is made in the payment function"
        );
        require(
            _loan.amountEth > 0,
            "Amount equal to 0, Loan is already paid."
        );

        if (_loan.isBasedNft) {
            if (_loan.lender != address(0)) {
                //if loan is taken transfer to the lender
                IERC721(_loan.nftContract).transferFrom(
                    address(this),
                    _loan.lender,
                    _loan.nftId
                ); // Transfer NFT to the lender
            }else {
                IERC721(_loan.nftContract).transferFrom(
                    address(this),
                    _loan.borrower,
                    _loan.nftId
                ); // Transfer NFT to the lender
            }
        }
        delete loans[loanId];
    }

    function retrieveAllEth() external onlyOwner {
        //Function for testing purposes not have stuck eth
        payable(msg.sender).transfer(address(this).balance);
    }

    function _findLoanIdByNft(IERC721 nftContract, uint256 nftId)
        internal
        view
        returns (uint256)
    {
        for (uint256 i = 0; i < _loanCounter.current(); i++) {
            if (
                loans[i].isBasedNft &&
                loans[i].nftContract == address(nftContract) &&
                loans[i].nftId == nftId
            ) {
                return i;
            }
        }
        revert("Loan not found");
    }

    function nftLoanExists(IERC721 nftContract, uint256 nftId)
        internal
        view
        returns (bool)
    {
        for (uint256 i = 0; i < _loanCounter.current(); i++) {
            if (
                loans[i].isBasedNft &&
                loans[i].nftContract == address(nftContract) &&
                loans[i].nftId == nftId
            ) {
                return true;
            }
        }
        return false;
    }

    function getLoanNumber() external view returns (uint256) {
        return _loanCounter.current();
    }
}
