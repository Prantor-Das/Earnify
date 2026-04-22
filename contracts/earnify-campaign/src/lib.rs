#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, map, symbol_short, token, Address, Env, Map, Symbol, Vec,
};

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Founder,
    Admin,
    TotalBudget,
    RemainingBudget,
    CampaignStatus,
    Scores,
    Claimed,
    Settled,
    TokenAddress,
}

#[contract]
pub struct EarnifyCampaignContract;

fn active_symbol(env: &Env) -> Symbol {
    Symbol::new(env, "ACTIVE")
}

fn ended_symbol(env: &Env) -> Symbol {
    Symbol::new(env, "ENDED")
}

fn get_scores(env: &Env) -> Map<Address, i128> {
    env.storage()
        .instance()
        .get::<DataKey, Map<Address, i128>>(&DataKey::Scores)
        .unwrap_or(map![env])
}

fn put_scores(env: &Env, scores: &Map<Address, i128>) {
    env.storage().instance().set(&DataKey::Scores, scores);
}

fn get_claimed(env: &Env) -> Map<Address, bool> {
    env.storage()
        .instance()
        .get::<DataKey, Map<Address, bool>>(&DataKey::Claimed)
        .unwrap_or(map![env])
}

fn put_claimed(env: &Env, claimed: &Map<Address, bool>) {
    env.storage().instance().set(&DataKey::Claimed, claimed);
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Founder) {
        panic!("contract_not_initialized");
    }
}

fn require_active(env: &Env) {
    let status = env
        .storage()
        .instance()
        .get::<DataKey, Symbol>(&DataKey::CampaignStatus)
        .unwrap_or(active_symbol(env));

    if status != active_symbol(env) {
        panic!("campaign_not_active");
    }
}

fn get_token_address(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::TokenAddress)
        .unwrap_or_else(|| panic!("token_not_configured"))
}

fn sum_scores(scores: &Map<Address, i128>) -> i128 {
    let mut total: i128 = 0;
    let keys: Vec<Address> = scores.keys();

    for key in keys.iter() {
        let score = scores.get(key.clone()).unwrap_or(0);
        total += score;
    }

    total
}

fn payout_for(scores: &Map<Address, i128>, creator: &Address, remaining_budget: i128) -> i128 {
    let creator_score = scores.get(creator.clone()).unwrap_or(0);
    if creator_score <= 0 {
        return 0;
    }

    let total_score = sum_scores(scores);
    if total_score <= 0 || remaining_budget <= 0 {
        return 0;
    }

    (creator_score * remaining_budget) / total_score
}

#[contractimpl]
impl EarnifyCampaignContract {
    pub fn initialize(env: Env, founder: Address, total_budget: i128) {
        if env.storage().instance().has(&DataKey::Founder) {
            panic!("already_initialized");
        }

        if total_budget <= 0 {
            panic!("invalid_total_budget");
        }

        founder.require_auth();

        env.storage().instance().set(&DataKey::Founder, &founder);
        env.storage()
            .instance()
            .set(&DataKey::Admin, &env.invoker());
        env.storage()
            .instance()
            .set(&DataKey::TotalBudget, &total_budget);
        env.storage()
            .instance()
            .set(&DataKey::RemainingBudget, &total_budget);
        env.storage()
            .instance()
            .set(&DataKey::CampaignStatus, &active_symbol(&env));
        env.storage().instance().set(&DataKey::Scores, &map![&env]);
        env.storage().instance().set(&DataKey::Claimed, &map![&env]);
        env.storage().instance().set(&DataKey::Settled, &false);

        env.events().publish(
            (symbol_short!("init"), founder.clone()),
            (total_budget, active_symbol(&env)),
        );
    }

    pub fn configure_token(env: Env, caller: Address, token_address: Address) {
        ensure_initialized(&env);

        let admin = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Admin)
            .unwrap_or_else(|| panic!("admin_not_found"));

        caller.require_auth();
        if caller != admin {
            panic!("only_admin");
        }

        env.storage()
            .instance()
            .set(&DataKey::TokenAddress, &token_address);
    }

    pub fn update_score(env: Env, caller: Address, creator: Address, new_score: i128) {
        ensure_initialized(&env);
        require_active(&env);

        if new_score < 0 {
            panic!("invalid_score");
        }

        let admin = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Admin)
            .unwrap_or_else(|| panic!("admin_not_found"));

        caller.require_auth();
        if caller != admin {
            panic!("only_admin");
        }

        let mut scores = get_scores(&env);
        scores.set(creator.clone(), new_score);
        put_scores(&env, &scores);

        env.events().publish(
            (symbol_short!("scoreupd"), creator.clone()),
            new_score,
        );
    }

    pub fn claim_payout(env: Env, creator: Address) {
        ensure_initialized(&env);
        require_active(&env);

        creator.require_auth();

        let mut claimed = get_claimed(&env);
        if claimed.get(creator.clone()).unwrap_or(false) {
            panic!("already_claimed");
        }

        let scores = get_scores(&env);
        let remaining_budget = env
            .storage()
            .instance()
            .get::<DataKey, i128>(&DataKey::RemainingBudget)
            .unwrap_or(0);

        let payout = payout_for(&scores, &creator, remaining_budget);
        if payout <= 0 {
            panic!("no_payout_available");
        }

        let token_address = get_token_address(&env);
        let token_client = token::Client::new(&env, &token_address);
        let contract_address = env.current_contract_address();
        token_client.transfer(&contract_address, &creator, &payout);

        claimed.set(creator.clone(), true);
        put_claimed(&env, &claimed);

        let updated_remaining = remaining_budget - payout;
        env.storage()
            .instance()
            .set(&DataKey::RemainingBudget, &updated_remaining);

        env.events().publish(
            (symbol_short!("payout"), creator.clone()),
            payout,
        );
    }

    pub fn end_campaign(env: Env, founder: Address) {
        ensure_initialized(&env);

        let stored_founder = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Founder)
            .unwrap_or_else(|| panic!("founder_not_found"));

        founder.require_auth();
        if founder != stored_founder {
            panic!("only_founder");
        }

        env.storage()
            .instance()
            .set(&DataKey::CampaignStatus, &ended_symbol(&env));

        env.events()
            .publish((symbol_short!("ended"), founder), ended_symbol(&env));
    }

    pub fn refund_unclaimed(env: Env, founder: Address) {
        ensure_initialized(&env);

        let stored_founder = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Founder)
            .unwrap_or_else(|| panic!("founder_not_found"));

        founder.require_auth();
        if founder != stored_founder {
            panic!("only_founder");
        }

        let status = env
            .storage()
            .instance()
            .get::<DataKey, Symbol>(&DataKey::CampaignStatus)
            .unwrap_or_else(|| panic!("status_not_found"));
        if status != ended_symbol(&env) {
            panic!("campaign_must_be_ended");
        }

        if env
            .storage()
            .instance()
            .get::<DataKey, bool>(&DataKey::Settled)
            .unwrap_or(false)
        {
            panic!("already_settled");
        }

        let remaining_budget = env
            .storage()
            .instance()
            .get::<DataKey, i128>(&DataKey::RemainingBudget)
            .unwrap_or(0);

        if remaining_budget > 0 {
            let token_address = get_token_address(&env);
            let token_client = token::Client::new(&env, &token_address);
            let contract_address = env.current_contract_address();
            token_client.transfer(&contract_address, &founder, &remaining_budget);

            env.storage().instance().set(&DataKey::RemainingBudget, &0_i128);
        }

        env.storage().instance().set(&DataKey::Settled, &true);

        env.events()
            .publish((symbol_short!("refund"), founder), remaining_budget);
    }

    pub fn get_score(env: Env, creator: Address) -> i128 {
        ensure_initialized(&env);
        let scores = get_scores(&env);
        scores.get(creator).unwrap_or(0)
    }

    pub fn get_payout_estimate(env: Env, creator: Address) -> i128 {
        ensure_initialized(&env);
        let scores = get_scores(&env);
        let remaining_budget = env
            .storage()
            .instance()
            .get::<DataKey, i128>(&DataKey::RemainingBudget)
            .unwrap_or(0);
        payout_for(&scores, &creator, remaining_budget)
    }

    pub fn get_campaign_info(env: Env) -> (i128, i128, Symbol) {
        ensure_initialized(&env);

        let total_budget = env
            .storage()
            .instance()
            .get::<DataKey, i128>(&DataKey::TotalBudget)
            .unwrap_or(0);
        let remaining_budget = env
            .storage()
            .instance()
            .get::<DataKey, i128>(&DataKey::RemainingBudget)
            .unwrap_or(0);
        let status = env
            .storage()
            .instance()
            .get::<DataKey, Symbol>(&DataKey::CampaignStatus)
            .unwrap_or(active_symbol(&env));

        (total_budget, remaining_budget, status)
    }

    pub fn get_all_scores(env: Env) -> Map<Address, i128> {
        ensure_initialized(&env);
        get_scores(&env)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    fn setup_contract(env: &Env) -> (Address, Address, Address) {
        let contract_id = env.register(EarnifyCampaignContract, ());
        let founder = Address::generate(env);
        let admin = Address::generate(env);

        env.mock_all_auths();

        env.as_contract(&contract_id, || {
            // no-op context
        });

        (contract_id, founder, admin)
    }

    #[test]
    fn initialize_and_store_budget() {
        let env = Env::default();
        env.mock_all_auths();

        let founder = Address::generate(&env);
        let contract_id = env.register(EarnifyCampaignContract, ());

        let client = EarnifyCampaignContractClient::new(&env, &contract_id);

        client.initialize(&founder, &1_000_i128);

        let (total, remaining, status) = client.get_campaign_info();
        assert_eq!(total, 1_000);
        assert_eq!(remaining, 1_000);
        assert_eq!(status, Symbol::new(&env, "ACTIVE"));
    }

    #[test]
    fn update_score_by_admin() {
        let env = Env::default();
        env.mock_all_auths();

        let founder = Address::generate(&env);
        let admin = Address::generate(&env);
        let creator = Address::generate(&env);
        let contract_id = env.register(EarnifyCampaignContract, ());

        env.set_invoker(admin.clone());
        let client = EarnifyCampaignContractClient::new(&env, &contract_id);
        client.initialize(&founder, &1_000_i128);

        client.update_score(&admin, &creator, &250_i128);

        assert_eq!(client.get_score(&creator), 250);
    }

    #[test]
    fn claim_payout_proportional_distribution() {
        let env = Env::default();
        env.mock_all_auths();

        let founder = Address::generate(&env);
        let admin = Address::generate(&env);
        let creator1 = Address::generate(&env);
        let creator2 = Address::generate(&env);
        let creator3 = Address::generate(&env);
        let contract_id = env.register(EarnifyCampaignContract, ());
        let client = EarnifyCampaignContractClient::new(&env, &contract_id);

        env.set_invoker(admin.clone());
        client.initialize(&founder, &1000_i128);

        client.update_score(&admin, &creator1, &10_i128);
        client.update_score(&admin, &creator2, &30_i128);
        client.update_score(&admin, &creator3, &60_i128);

        let p1 = client.get_payout_estimate(&creator1);
        let p2 = client.get_payout_estimate(&creator2);
        let p3 = client.get_payout_estimate(&creator3);

        assert_eq!(p1, 100);
        assert_eq!(p2, 300);
        assert_eq!(p3, 600);
    }

    #[test]
    fn refund_unclaimed_after_end_campaign() {
        let env = Env::default();
        env.mock_all_auths();

        let founder = Address::generate(&env);
        let admin = Address::generate(&env);
        let contract_id = env.register(EarnifyCampaignContract, ());
        let client = EarnifyCampaignContractClient::new(&env, &contract_id);

        env.set_invoker(admin);
        client.initialize(&founder, &750_i128);

        client.end_campaign(&founder);
        let (_, remaining_before, status) = client.get_campaign_info();
        assert_eq!(status, Symbol::new(&env, "ENDED"));
        assert_eq!(remaining_before, 750);
    }
}
