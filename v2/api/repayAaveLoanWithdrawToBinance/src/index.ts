// Import necessary libraries
import { ethers } from 'ethers';
import axios from 'axios';

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

const privateKey: string = process.env.PRIVATE_KEY!;
const integratorId: string = process.env.INTEGRATOR_ID!;
const ethereumRpcEndpoint: string = process.env.ETHEREUM_RPC_ENDPOINT!;
const aavePoolAddress: string = process.env.AAVE_POOL_ADDRESS!;
const binanceAddress: string = process.env.BINANCE_ADDRESS!;

// Define chain and token addresses
const ethereumId = '1'; // Ethereum
const binanceSmartChainId = '56'; // Binance Smart Chain
const nativeToken = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Define asset, amount, interest rate mode, and address
const repayAsset = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // The address of the borrowed underlying asset previously borrowed
const repayAmount = '10000000000000000'; // The amount to repay - Send the value type(uint256).max in order to repay the whole debt for `asset` on the specific `debtMode`
const repayInterestRateMode = 1; // The interest rate mode at of the debt the user wants to repay: 1 for Stable, 2 for Variable
const repayOnBehalfOf = '0x0000000000000000000000000000000000000000'; // The address of the user who will get his debt reduced/removed. Should be the address of the user calling the function if he wants to reduce/remove his own debt, or the address of any other other borrower whose debt should be removed

// Import Aave lending pool ABI
import aavePoolAbi from '../abi/aavePoolAbi';

// Set up JSON RPC provider and signer
const provider = new ethers.providers.JsonRpcProvider(ethereumRpcEndpoint);
const signer = new ethers.Wallet(privateKey, provider);

const getRoute = async (params: any) => {
	try {
		const result = await axios.post('https://v2.api.squidrouter.com/v2/route', params, {
			headers: {
				'x-integrator-id': integratorId,
				'Content-Type': 'application/json',
			},
		});
		return result.data;
	} catch (error) {
		// Log the error response if it's available.
		if (error.response) {
			console.error('API error:', error.response.data);
		}
		console.error('Error with parameters:', params);
		throw error;
	}
};

// Create contract interface and encode repay function for Aave
const aaveLendingPoolInterface = new ethers.utils.Interface(aavePoolAbi);
const repayEncodedData = aaveLendingPoolInterface.encodeFunctionData('repay', [
	repayAsset,
	repayAmount,
	repayInterestRateMode,
	repayOnBehalfOf,
]);

(async () => {
	// Set up parameters for repaying the loan, swapping tokens, and withdrawing
	const params = {
		fromAddress: signer.address,
		fromChain: ethereumId,
		fromToken: repayAsset,
		fromAmount: repayAmount,
		toChain: binanceSmartChainId,
		toToken: nativeToken,
		toAddress: binanceAddress,
		slippage: 1,
		slippageConfig: {
			autoMode: 1,
		},
		enableBoost: true,
		quoteOnly: false,
		// Customize pre-hooks for repaying the loan
		preHooks: [
			{
				callType: 0, // SquidCallType.DEFAULT
				target: aavePoolAddress,
				value: '0',
				callData: repayEncodedData,
				estimatedGas: '50000',
				payload: {
					tokenAddress: repayAsset,
					inputPos: 1,
				},
			},
		],
	};

	console.log('Parameters:', params);

	// Get the swap route using Squid API
	const route = (await getRoute(params)).route;
	console.log('Calculated route:', route.estimate.toAmount);
	console.log('Calculated fee costs:', route.estimate.feeCosts);

	const transactionRequest = route.transactionRequest;

	// Execute the repayment, swap, and withdrawal transaction
	const contract = new ethers.Contract(transactionRequest.targetAddress, aavePoolAbi, signer);
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
