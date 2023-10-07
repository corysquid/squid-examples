// Import necessary libraries
import { ethers } from 'ethers';
import axios from 'axios';

// Load environment variables from the .env file
import * as dotenv from 'dotenv';
dotenv.config();

const privateKey: string = process.env.PRIVATE_KEY!;
const integratorId: string = process.env.INTEGRATOR_ID!;
const rpcEndpoint: string = process.env.RPC_ENDPOINT!;
const nftContractAddress: string = process.env.NFT_CONTRACT_ADDRESS!;

// Define chain and token addresses
const fromChainId = '1'; // Define departing chain, set to Ethereum by default
const polygonId = '137'; // Polygon
const nativeToken = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'; // Define departing token

// Define amount to be sent
const amount = '10000000000000000';

// Import necessary ABI's
import nftContractAbi from '../abi/squidEasterEggNftAbi';
import erc20Abi from '../abi/erc20Abi';

// Set up JSON RPC provider and signer for source chain (Ethereum)
const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);
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

// Create contract interfaces and encode calldata
const nftContractInterface = new ethers.utils.Interface(nftContractAbi);
const mintEncodedData = nftContractInterface.encodeFunctionData('mint', [signer.address]);

const erc20ContractInterface = new ethers.utils.Interface(erc20Abi);
const transferRemainingBalanceEncodeData = erc20ContractInterface.encodeFunctionData('transfer', [signer.address, '0']);

(async () => {
	// Set up parameters for swapping tokens and minting NFT on Polygon
	const params = {
		fromAddress: signer.address,
		fromChain: fromChainId,
		fromToken: nativeToken,
		fromAmount: amount,
		toChain: polygonId,
		toToken: nativeToken,
		toAddress: signer.address,
		slippage: 1,
		slippageConfig: {
			autoMode: 1,
		},
		enableBoost: true,
		quoteOnly: false,
		// Customize contract call for minting NFT on Polygon
		postHooks: [
			{
				callType: 0, // SquidCallType.DEFAULT
				target: nftContractAddress,
				value: '0',
				callData: mintEncodedData,
				payload: {
					tokenAddress: nativeToken,
					inputPos: 1,
				},
				estimatedGas: '50000',
			},
			{
				callType: 1, // SquidCallType.FULL_TOKEN_BALANCE
				target: nativeToken,
				value: '0',
				callData: transferRemainingBalanceEncodeData,
				payload: {
					tokenAddress: nativeToken,
					inputPos: 1,
				},
				estimatedGas: '50000',
			},
		],
	};

	console.log('Parameters:', params);

	// Get the swap route using Squid API
	const route = (await getRoute(params)).route;
	console.log('Calculated route:', route.estimate.toAmount);

	const transactionRequest = route.transactionRequest;

	// Execute the swap and minting transaction
	const contract = new ethers.Contract(transactionRequest.targetAddress, nftContractAbi, signer);
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
