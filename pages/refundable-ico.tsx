import {
  Button,
  Stack,
  Heading,
  Box,
  Flex,
  Input,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Address } from '@coinbarn/ergo-ts';
import { Serializer } from '@coinbarn/ergo-ts/dist/serializer';
import { loadTokensFromWallet } from '../src/services/GenerateSendFundsTx';
import { sendFunds } from '../src/services/Transaction';
import { checkTx, p2sNode } from '../src/services/helpers';
import { encodeHex } from '../src/lib/serializer';
import { get } from '../src/lib/rest';
import styles from '../styles/Home.module.css';
import ErgoScriptEditor from './components/ErgoScriptEditor';
import TransactionPreviewModal from './components/TransactionPreviewModal';
import { do_swap, do_refund } from '../src/lib/yoroiUtils';





const swapArrayLocs = function (arr, index1, index2) {
  const temp = arr[index1];

  arr[index1] = arr[index2];
  arr[index2] = temp;
};

const baseContract = `
  sigmaProp(INPUTS(0).R4[Coll[Byte]].get == blake2b256(OUTPUTS(0).R4[Coll[Byte]].get))
`;

async function listTokens() {
  await ergoConnector.nautilus.connect();

  return await loadTokensFromWallet();
}

async function listLockedListings(address: string) {
  if (!address) return [];
  return await get(`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${address}`)
    .then((resp) => resp.json())
    .then((resp) => resp.items.filter((item) => item.assets.length > 0));
}

export default function Send() {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState({ tokenId: '', name: '' });
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [lockedTokens, setLockedTokens] = useState([]);
  const [tokenToRelease, setTokenToRelease] = useState({ assets: [{ name: '' }] });
  const [compileError, setCompileError] = useState('');
  const [contractAddress, setContractAddress] = useState(null);
  const [contract, setContract] = useState('');
  const [unsignedTxJson, setUnsignedTxJson] = useState({});
  const [isGeneratingLockTx, setIsGeneratingLockTx] = useState(false);
  const [isGeneratingReleaseTx, setIsGeneratingReleaseTx] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    async function fetchData() {
      setContract(baseContract);

      const resp = await p2sNode(`${baseContract}`);
      setContractAddress(resp.address);

      const items = await listLockedListings(resp.address);
      setLockedTokens(items);

      setIsLoadingTokens(true);
      const tokensMap = await listTokens();

      setTokens(Object.values(tokensMap));
      setIsLoadingTokens(false);
    }

    fetchData();
  }, []);





  async function handleReleaseToken() {
    setIsGeneratingReleaseTx(true);
    // connect to ergo wallet
    if (!tokenToRelease) return;

    await ergoConnector.nautilus.connect();

    const changeAddress = await ergo.get_change_address();
    const tree = new Address(changeAddress).ergoTree;
    let unsignedTx;

    // generate unsigned transaction
    try {
      unsignedTx = await sendFunds({
        funds: {
          ERG: 0,
          tokens: [],
        },
        toAddress: changeAddress,
        additionalRegisters: {
          R4: await encodeHex(Serializer.stringToHex(pin)),
        },
      });
    } catch (e) {
      alert(e.message);
      setIsGeneratingReleaseTx(false);
    }

    // on top of regular send funds tx do some enrichements.
    // this will move to an external package.
    unsignedTx.inputs.push(Object.assign({}, tokenToRelease, { extension: {} }));
    unsignedTx.outputs[0] = Object.assign({}, unsignedTx.outputs[0], {
      additionalRegisters: {
        R4: await encodeHex(Serializer.stringToHex(pin)),
      },
    });

    unsignedTx.outputs[1] = Object.assign({}, tokenToRelease, { ergoTree: tree });

    swapArrayLocs(unsignedTx.inputs, 0, 1);

    console.log(unsignedTx);
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsGeneratingReleaseTx(false);
    onOpen();
  }

  async function signAndSubmit(unsignedTx) {
    const signedTx = await ergo.sign_tx(JSON.parse(unsignedTx));
    console.log(signedTx);

    const txCheckResponse = await checkTx(signedTx);
    console.log(txCheckResponse);

    // submit tx
    const txHash = await ergo.submit_tx(signedTx);

    console.log(`https://explorer.ergoplatform.com/en/transactions/${txHash}`);

    return txHash;
    // window.open(`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${resp.address}`);
    window.open(`https://explorer.ergoplatform.com/en/transactions/${txHash}`);
  }

  return (
    <div className={styles.container}>
      <TransactionPreviewModal
        isOpen={isOpen}
        onClose={onClose}
        unsignedTx={unsignedTxJson}
        handleSubmit={() => signAndSubmit(unsignedTxJson)}
      />

      <Stack spacing={6}>
        <Heading as="h3" size="lg">
          Interactive Example: Refundable ico
        </Heading>

        <Flex>
          <Box w="50%">
            <ErgoScriptEditor onChange={do_swap} height="250px" code={contract} />
          </Box>
          <Box w="50%" paddingLeft={10}>
            {compileError && <div className="compile-error">{compileError}</div>}
            {contractAddress && (
              <div>
                <h5>Contract Address - {lockedTokens.length} boxes locked</h5>
                <a
                  href={`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${contractAddress}`}
                  target="_blank"
                  style={{ color: 'blue', textDecoration: 'underline' }}
                  rel="noreferrer"
                >
                  {contractAddress}
                </a>
              </div>
            )}
          </Box>
        </Flex>
      </Stack>



      <div className="step-section" data-title="1) Choose the amount of ergs you want to spend">
        <Input placeholder="Ergs"  id="Ergs" width={200} />
        <Button
               onClick={() => {
                      
                      do_swap(document.getElementById("Ergs").value);
                    }}
          width="200px"
   
          colorScheme="blue"
        >
          Buy Ico
        </Button>
      </div>

      <div className="step-section" data-title="1) Choose how much you want to refund">
      
        <Input placeholder="Refund"  id="Refund" width={200} />
        <Button
         onClick={() => {
                      
          do_refund(document.getElementById("Refund").value);
        }}
          width="200px"
   
          colorScheme="blue"
        >
          Refund
        </Button>
      </div>

      <div className="dapp-footer">
        <Heading as="h3" size="sm" style={{ marginTop: 50 }}>
          References:
        </Heading>
        <ul>
          <li>
            <a
              href="https://github.com/ergoplatform/ergoscript-by-example/blob/main/pinLockContract.md"
              target={'_blank'}
              rel="noreferrer"
            >
              Comet Refund Ico:
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
