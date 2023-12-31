// Import necessary libraries
import { ethers } from 'ethers';
import axios from 'axios';

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

const privateKey: string = process.env.PRIVATE_KEY!;
const integratorId: string = process.env.INTEGRATOR_ID!;
const arbitrumRpcEndpoint: string = process.env.ARBITRUM_RPC_ENDPOINT!;

// Define chain and token addresses
const arbitrumChainId = 42161; // Arbitrum
const baseChainId = 8453; // Base
const nativeToken = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const baseUsdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Define amount to be sent
const amount = '10000000000000000';

// Set up JSON RPC provider and signer
const provider = new ethers.providers.JsonRpcProvider(arbitrumRpcEndpoint);
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

(async () => {
	// Set up parameters for swapping tokens
	const params = {
		fromAddress: signer.address,
		fromChain: arbitrumChainId,
		fromToken: nativeToken,
		fromAmount: amount,
		toChain: baseChainId,
		toToken: baseUsdc,
		toAddress: signer.address,
		slippage: 1,
		enableForecall: true,
	};

	console.log('Parameters:', params);

	// Get the swap route using Squid API
	const route = (await getRoute(params)).route;
	console.log('Calculated route:', route.estimate.toAmount);

	const transactionRequest = route.transactionRequest;

	// Execute the swap transaction
	const contract = new ethers.Contract(transactionRequest.targetAddress, [], signer);

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
