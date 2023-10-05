// Import necessary libraries
import { ethers } from 'ethers';
import axios from 'axios';

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

const privateKey: string = process.env.PRIVATE_KEY!;
const integratorId: string = process.env.INTEGRATOR_ID!;
const ethereumRpcEndpoint: string = process.env.ETHEREUM_RPC_ENDPOINT!;
const stakingContractAddress: string = process.env.STAKING_CONTRACT_ADDRESS!;

// Define chain and token addresses
const ethereumId = 1; // Ethereum
const fantomId = 250; // Fantom
const nativeToken = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ethereumUsdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// Define amount to swap and stake
const amountToSwap = '10000000000000000';

// Import staking contract ABI
import stakingContractAbi from '../abi/fantomSFC';

// Set up JSON RPC provider and signer
const provider = new ethers.providers.JsonRpcProvider(ethereumRpcEndpoint);
const signer = new ethers.Wallet(privateKey, provider);

const getRoute = async (params: any) => {
	const result = await axios.get('https://api.squidrouter.com/v1/route', {
		params: params,
		headers: {
			'x-integrator-id': integratorId,
		},
	});
	return result.data;
};

// Create contract interface and encode delegate (Fantom staking) function
const stakingContractInterface = new ethers.utils.Interface(stakingContractAbi);
const delegateEncodedData = stakingContractInterface.encodeFunctionData('delegate', [amountToSwap]);

(async () => {
	// Set up parameters for swapping tokens and staking
	const params = {
		fromAddress: signer.address,
		fromChain: ethereumId,
		fromToken: ethereumUsdc,
		fromAmount: amountToSwap,
		toChain: fantomId,
		toToken: nativeToken,
		toAddress: signer.address,
		slippage: 1,
		enableForecall: true,
		quoteOnly: false,
		// Customize contract call for staking on Fantom
		customContractCalls: [
			{
				callType: 1, // SquidCallType.FULL_TOKEN_BALANCE
				target: stakingContractAddress,
				value: '0',
				callData: delegateEncodedData,
				payload: {
					tokenAddress: ethereumUsdc,
					inputPos: 0,
				},
				estimatedGas: '50000',
			},
		],
	};

	console.log('Parameters:', params);

	// Get the swap route using Squid API
	const route = (await getRoute(params)).route;
	console.log('Calculated route:', route.estimate.toAmount);
	console.log('Calculated fee costs:', route.estimate.feeCosts);

	const transactionRequest = route.transactionRequest;

	// Execute the swap and staking transaction
	const contract = new ethers.Contract(transactionRequest.targetAddress, stakingContractAbi, signer);
	const tx = await contract.send(transactionRequest.data, {
		value: transactionRequest.value,
		gasPrice: transactionRequest.gasPrice,
		gasLimit: transactionRequest.gasLimit,
	});
	const txReceipt = await tx.wait();

	// Show the transaction receipt with Axelarscan link
	const axelarScanLink = 'https://axelarscan.io/gmp/' + txReceipt.transactionHash;
	console.log(`Finished! Check Axelarscan for details: ${axelarScanLink}`);

	// Display the API call link to track transaction status
	console.log(
		`Track status via API call: https://api.squidrouter.com/v1/status?transactionId=${txReceipt.transactionHash}`
	);
})();
