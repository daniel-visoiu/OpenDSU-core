require("../../../../../psknode/bundles/testsRuntime");
const tir = require("../../../../../psknode/tests/util/tir");

const dc = require("double-check");
const assert = dc.assert;
const openDSU = require('../../../index');
$$.__registerModule("opendsu", openDSU);
const enclaveAPI = openDSU.loadAPI("enclave");
const scAPI = openDSU.loadAPI("sc");

assert.callback('Encrypt AES on Walled DB test', (testFinished) => {
    dc.createTestFolder('createDSU', async () => {
        const vaultDomainConfig = {
            "anchoring": {
                "type": "FS",
                "option": {}
            }
        }
        await tir.launchConfigurableApiHubTestNodeAsync({ domains: [{ name: "vault", config: vaultDomainConfig }] });
        const sc = scAPI.getSecurityContext();
        sc.on("initialised", async () => {
            const walletDBEnclave = enclaveAPI.initialiseWalletDBEnclave();
            walletDBEnclave.on("initialised", () => {
                try {
                    const secretKey = "valid-AES-encryption-key-test123";
                    const keyAlias = "key1";
                    const message = "message";

                    walletDBEnclave.storeSecretKey("", secretKey, keyAlias, (err, rec) => {
                        assert.true(err == undefined, "Error occured");
                        assert.objectsAreEqual(secretKey, rec.secretKey, "Records do not match");

                        walletDBEnclave.encryptAES("", keyAlias, message, (err, encrypedMessage) => {
                            assert.true(err == undefined, "Error occured");
                            assert.true(encrypedMessage !== undefined);
                            testFinished();
                        })
                    })
                } catch (e) {
                    return console.log(e);
                }
            })
        })
    });
}, 500);

